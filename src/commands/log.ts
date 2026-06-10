import { readStore } from "../db/store.ts";

export async function log(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");

  if (json) {
    console.log(JSON.stringify(
      [...store.commits].reverse().map((c) => ({
        id: c.id,
        date: c.created_at,
        message: c.message,
        assertion_id: c.assertion_id,
        claim: `${c.snapshot_before.subject} ${c.snapshot_before.relation} ${c.snapshot_before.object}`,
        changes: (["confidence", "status", "evidence"] as const)
          .filter((f) => JSON.stringify(c.snapshot_before[f]) !== JSON.stringify(c.snapshot_after[f]))
          .map((f) => ({ field: f, from: c.snapshot_before[f], to: c.snapshot_after[f] })),
      })),
      null, 2
    ));
    return;
  }

  if (store.commits.length === 0) {
    console.log("No commits yet.");
    return;
  }

  const commits = [...store.commits].reverse();

  for (const c of commits) {
    const before = c.snapshot_before;
    const after = c.snapshot_after;

    console.log(`\ncommit ${c.id}`);
    console.log(`Date:   ${c.created_at}`);
    console.log(`\n    ${c.message}\n`);
    console.log(`    Assertion: ${before.subject} ${before.relation} ${before.object}`);

    // Show what changed
    const fields = ["confidence", "status", "evidence"] as const;
    for (const f of fields) {
      if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) {
        if (f === "evidence") {
          console.log(`    ${f}: [updated]`);
        } else {
          console.log(`    ${f}: ${before[f]} → ${after[f]}`);
        }
      }
    }
  }
}
