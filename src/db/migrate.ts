import { join } from "path";
import { diffStores } from "./events.ts";
import type { Store } from "./store.ts";

const REPO_DIR = ".reason";

function repoPath(...segments: string[]): string {
  return join(process.cwd(), REPO_DIR, ...segments);
}

const empty: Store = {
  assertions: [], observations: [], patches: [],
  commits: [], outcomes: [], actions: [],
};

/**
 * One-time migration from store.json to events.jsonl + snapshot.json.
 * Emits synthetic creation events for every existing record using original timestamps.
 * Renames store.json → store.json.bak on success.
 */
export async function migrateFromLegacy(eventsPath: string, snapshotPath: string): Promise<Store> {
  const legacyFile = Bun.file(repoPath("store.json"));
  const legacy = await legacyFile.json() as Store;

  // Apply migrations that were previously inline in readStore
  if (!legacy.actions) legacy.actions = [];
  for (const o of legacy.outcomes ?? []) {
    if (o.action_id === undefined) o.action_id = null;
  }

  // Diff empty → legacy to produce creation events for every record
  const events = diffStores(empty, legacy);
  const lines = events.map(e => JSON.stringify(e)).join("\n") + "\n";

  await Bun.write(eventsPath, lines);
  await Bun.write(snapshotPath, JSON.stringify(legacy, null, 2));

  // Rename legacy file so we don't re-migrate
  await Bun.$`mv ${repoPath("store.json")} ${repoPath("store.json.bak")}`.quiet();

  console.error(`[reason] Migrated store.json → events.jsonl + snapshot.json (backup: store.json.bak)`);
  return legacy;
}
