import { join } from "path";
import { existsSync, statSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync, rmSync } from "fs";
import type { Assertion, Observation, EpistemicPatch, Commit, Outcome, Action } from "../types.ts";
import { applyEvent, diffStores } from "./events.ts";

const REPO_DIR = ".reason";

export interface Store {
  assertions: Assertion[];
  observations: Observation[];
  patches: EpistemicPatch[];
  commits: Commit[];
  outcomes: Outcome[];
  actions: Action[];
}

function repoPath(...segments: string[]): string {
  return join(process.cwd(), REPO_DIR, ...segments);
}

export const eventsPath   = () => repoPath("events.jsonl");
export const snapshotPath = () => repoPath("snapshot.json");
const LOCK_PATH           = () => repoPath("write.lock");

// Cached snapshot from the last readStore — used to diff on write
let _lastSnapshot: Store | null = null;

export function isInitialized(): boolean {
  const ep = eventsPath();
  const sp = snapshotPath();
  return (existsSync(ep) && statSync(ep).size > 0) || existsSync(sp);
}

export async function readStore(): Promise<Store> {
  if (!existsSync(snapshotPath())) {
    throw new Error("No reasoning repository found. Run `reason init` first.");
  }

  const store = readSnapshot();

  if (store.assertions.length > 0 && "status" in store.assertions[0]) {
    throw new Error("Store format is outdated. Run `reason migrate` to upgrade.");
  }

  _lastSnapshot = structuredClone(store);
  return store;
}

export async function writeStore(store: Store): Promise<void> {
  const before = _lastSnapshot ?? emptyStore();
  const events = diffStores(before, store);

  withWriteLock(() => {
    const latest = readSnapshot();
    const eventsToAppend = events.filter((event) => eventChangesStore(latest, event));

    if (eventsToAppend.length > 0) {
      const lines = eventsToAppend.map(e => JSON.stringify(e)).join("\n") + "\n";
      appendFileSync(eventsPath(), lines, "utf8");

      for (const event of eventsToAppend) {
        applyEvent(latest, event);
      }
    }

    writeSnapshot(latest);
    _lastSnapshot = structuredClone(latest);
  });
}

export async function initStore(): Promise<void> {
  const dir = repoPath();
  mkdirSync(dir, { recursive: true });

  if (existsSync(eventsPath()) || existsSync(snapshotPath())) {
    throw new Error("Repository already initialized.");
  }

  const empty = emptyStore();
  writeFileSync(eventsPath(), "", "utf8");
  writeFileSync(snapshotPath(), JSON.stringify(empty, null, 2), "utf8");
}

export function emptyStore(): Store {
  return {
    assertions: [],
    observations: [],
    patches: [],
    commits: [],
    outcomes: [],
    actions: [],
  };
}

function readSnapshot(): Store {
  return JSON.parse(readFileSync(snapshotPath(), "utf8")) as Store;
}

function writeSnapshot(store: Store): void {
  const tmpPath = `${snapshotPath()}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmpPath, snapshotPath());
}

function withWriteLock<T>(fn: () => T): T {
  const lockPath = LOCK_PATH();
  const timeoutMs = 10_000;
  const started = Date.now();

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      if (Date.now() - started > timeoutMs) {
        throw new Error("Timed out waiting for reason store write lock.");
      }
      sleep(10);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function eventChangesStore(store: Store, event: ReturnType<typeof diffStores>[number]): boolean {
  switch (event.type) {
    case "assertion_created":
      return !store.assertions.some((a) => a.id === event.payload.id);
    case "observation_added":
      return !store.observations.some((o) => o.id === event.payload.id);
    case "patch_proposed":
      return !store.patches.some((p) => p.id === event.payload.id);
    case "patch_status_changed": {
      const patch = store.patches.find((p) => p.id === event.payload.id);
      return !!patch && patch.status !== event.payload.to;
    }
    case "commit_created":
      return !store.commits.some((c) => c.id === event.payload.id || c.patch_id === event.payload.patch_id);
    case "action_opened":
      return !store.actions.some((a) => a.id === event.payload.id);
    case "action_status_changed": {
      const action = store.actions.find((a) => a.id === event.payload.id);
      return !!action && action.status !== event.payload.to;
    }
    case "outcome_recorded":
      return !store.outcomes.some((o) =>
        o.id === event.payload.id ||
        (event.payload.action_id !== null && o.action_id === event.payload.action_id)
      );
  }
}
