import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { emptyStore, snapshotPath, eventsPath } from "../db/store.ts";
import { diffStores } from "../db/events.ts";
import type { Store } from "../db/store.ts";
import type { Assertion, Commit } from "../types.ts";

// Shape of a v1 assertion (before immutable refactor)
interface V1Assertion {
  id: string;
  subject: string;
  relation: string;
  object: string;
  confidence: number;
  evidence: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Shape of a v1 commit
interface V1Commit {
  id: string;
  patch_id: string;
  assertion_id: string;
  snapshot_before: V1Assertion;
  snapshot_after: V1Assertion;
  message: string;
  created_at: string;
}

function isV1Store(raw: Record<string, unknown>): boolean {
  const assertions = raw.assertions as unknown[];
  if (!Array.isArray(assertions) || assertions.length === 0) return false;
  return "status" in (assertions[0] as Record<string, unknown>);
}

function migrateAssertions(v1: V1Assertion[]): Assertion[] {
  return v1.map(a => ({
    id: a.id,
    parent_id: null,
    root_id: a.id,
    version: 1,
    subject: a.subject,
    relation: a.relation,
    object: a.object,
    confidence: a.confidence,
    evidence: a.evidence,
    created_at: a.created_at,
  }));
}

function migrateCommits(v1: V1Commit[]): Commit[] {
  return v1.map(c => ({
    id: c.id,
    patch_id: c.patch_id,
    from_assertion_id: c.assertion_id,
    to_assertion_id: c.assertion_id,
    message: c.message,
    created_at: c.created_at,
  }));
}

export async function migrate(args: string[]) {
  const sp = snapshotPath();
  const ep = eventsPath();

  if (!existsSync(sp)) {
    console.error("No repository found. Run `reason init` first.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(sp, "utf8")) as Record<string, unknown>;

  if (!isV1Store(raw)) {
    console.log("Store is already up to date. No migration needed.");
    return;
  }

  console.log("Migrating store from v1 → v2 (immutable assertions)...\n");

  // Back up existing files
  const spBak = `${sp}.pre-v2.bak`;
  const epBak = `${ep}.pre-v2.bak`;
  copyFileSync(sp, spBak);
  if (existsSync(ep)) copyFileSync(ep, epBak);
  console.log(`  Backed up snapshot → ${spBak}`);
  console.log(`  Backed up events   → ${epBak}`);

  // Migrate
  const v1Store = raw as {
    assertions: V1Assertion[];
    observations: Store["observations"];
    patches: Store["patches"];
    commits: V1Commit[];
    outcomes: Store["outcomes"];
    actions: Store["actions"];
  };

  const migrated: Store = {
    assertions: migrateAssertions(v1Store.assertions ?? []),
    observations: v1Store.observations ?? [],
    patches: v1Store.patches ?? [],
    commits: migrateCommits(v1Store.commits ?? []),
    outcomes: v1Store.outcomes ?? [],
    actions: v1Store.actions ?? [],
  };

  // Rewrite snapshot
  writeFileSync(sp, JSON.stringify(migrated, null, 2), "utf8");

  // Rebuild events.jsonl from migrated snapshot
  const events = diffStores(emptyStore(), migrated);
  const lines = events.map(e => JSON.stringify(e)).join("\n") + (events.length > 0 ? "\n" : "");
  writeFileSync(ep, lines, "utf8");

  console.log(`\n  Migrated ${migrated.assertions.length} assertions`);
  console.log(`  Migrated ${migrated.commits.length} commits`);
  console.log(`  Rebuilt events.jsonl (${events.length} events)`);
  console.log("\nMigration complete. Run `reason status` to verify.");
}
