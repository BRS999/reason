import { join } from "path";
import { existsSync, statSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import type { Assertion, Observation, EpistemicPatch, Commit, Outcome, Action } from "../types.ts";
import { diffStores } from "./events.ts";

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

// Cached snapshot from the last readStore — used to diff on write
let _lastSnapshot: Store | null = null;

export function isInitialized(): boolean {
  const ep = EVENTS_PATH();
  const sp = SNAPSHOT_PATH();
  return (existsSync(ep) && statSync(ep).size > 0) || existsSync(sp);
}

export async function readStore(): Promise<Store> {
  if (!existsSync(SNAPSHOT_PATH())) {
    throw new Error("No reasoning repository found. Run `reason init` first.");
  }

  const store = JSON.parse(readFileSync(SNAPSHOT_PATH(), "utf8")) as Store;
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

  writeFileSync(SNAPSHOT_PATH(), JSON.stringify(store, null, 2), "utf8");
  _lastSnapshot = structuredClone(store);
}

export async function initStore(): Promise<void> {
  const dir = repoPath();
  mkdirSync(dir, { recursive: true });

  if (existsSync(EVENTS_PATH()) || existsSync(SNAPSHOT_PATH())) {
    throw new Error("Repository already initialized.");
  }

  const empty = emptyStore();
  writeFileSync(EVENTS_PATH(), "", "utf8");
  writeFileSync(SNAPSHOT_PATH(), JSON.stringify(empty, null, 2), "utf8");
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
