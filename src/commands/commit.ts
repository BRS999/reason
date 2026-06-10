import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt } from "../ui.ts";
import type { Assertion } from "../types.ts";

export async function commit(_args: string[]) {
  const store = await readStore();

  const approved = store.patches.filter((p) => p.status === "approved");
  if (approved.length === 0) {
    console.log("No approved patches to commit. Run `reason review` first.");
    return;
  }

  console.log(`${approved.length} approved patch(es) ready to commit.\n`);

  for (const patch of approved) {
    const idx = store.assertions.findIndex((a) => a.id === patch.assertion_id);
    if (idx === -1) {
      console.warn(`  Warning: assertion ${patch.assertion_id} not found, skipping ${patch.id}`);
      continue;
    }

    const before: Assertion = { ...store.assertions[idx] };
    const after: Assertion = { ...before, updated_at: now() };

    for (const change of patch.changes) {
      (after as unknown as Record<string, unknown>)[change.field] = change.to;
    }

    const message = await prompt(`Commit message for ${patch.id} (or enter to use reason): `);

    const commitRecord = {
      id: newId("cmt"),
      patch_id: patch.id,
      assertion_id: patch.assertion_id,
      snapshot_before: before,
      snapshot_after: after,
      message: message.trim() || patch.reason,
      created_at: now(),
    };

    store.assertions[idx] = after;
    patch.status = "committed";
    store.commits.push(commitRecord);

    console.log(`  Committed: ${commitRecord.id}`);
    console.log(`  "${before.subject} ${before.relation} ${before.object}"`);
    for (const c of patch.changes) {
      console.log(`    ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    }
  }

  await writeStore(store);
  console.log("\nDone. Run `reason log` to see history.");
}
