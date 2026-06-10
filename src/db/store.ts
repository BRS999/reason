import { join } from "path";
import { appendFileSync } from "fs";
import type { Assertion, Observation, EpistemicPatch, Commit, Outcome, Action } from "../types.ts";
import { diffStores } from "./events.ts";
import { migrateFromLegacy } from "./migrate.ts";

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

const EVENTS_PATH   = () => repoPath("events.jsonl");
const SNAPSHOT_PATH = () => repoPath("snapshot.json");
const LEGACY_PATH   = () => repoPath("store.json");

// Cached snapshot from the last readStore — used to diff on write
let _lastSnapshot: Store | null = null;

export function isInitialized(): boolean {
  return Bun.file(EVENTS_PATH()).size > 0 || Bun.file(SNAPSHOT_PATH()).size > 0;
}

export async function readStore(): Promise<Store> {
  const eventsFile   = Bun.file(EVENTS_PATH());
  const snapshotFile = Bun.file(SNAPSHOT_PATH());
  const legacyFile   = Bun.file(LEGACY_PATH());

  // Auto-migrate from legacy store.json if needed
  if (!(await eventsFile.exists()) && !(await snapshotFile.exists())) {
    if (await legacyFile.exists()) {
      const store = await migrateFromLegacy(EVENTS_PATH(), SNAPSHOT_PATH());
      _lastSnapshot = structuredClone(store);
      return store;
    }
    throw new Error("No reasoning repository found. Run `reason init` first.");
  }

  // Fast path: read snapshot directly
  if (!(await snapshotFile.exists())) {
    throw new Error("snapshot.json missing. Run `reason init` or restore from events.jsonl.");
  }

  const store = await snapshotFile.json() as Store;
  _lastSnapshot = structuredClone(store);
  return store;
}

export async function writeStore(store: Store): Promise<void> {
  const before = _lastSnapshot ?? emptyStore();
  const events = diffStores(before, store);

  if (events.length > 0) {
    const lines = events.map(e => JSON.stringify(e)).join("\n") + "\n";
    appendFileSync(EVENTS_PATH(), lines, "utf8");
  }

  await Bun.write(SNAPSHOT_PATH(), JSON.stringify(store, null, 2));
  _lastSnapshot = structuredClone(store);
}

export async function initStore(): Promise<void> {
  const dir = repoPath();
  await Bun.$`mkdir -p ${dir}`.quiet();

  if (await Bun.file(EVENTS_PATH()).exists() || await Bun.file(SNAPSHOT_PATH()).exists()) {
    throw new Error("Repository already initialized.");
  }

  const empty = emptyStore();
  await Bun.write(EVENTS_PATH(), "");
  await Bun.write(SNAPSHOT_PATH(), JSON.stringify(empty, null, 2));
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
