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
    const fromAssertion = store.assertions.find((a) => a.id === patch.assertion_id);
    if (!fromAssertion) {
      console.warn(`  Warning: assertion ${patch.assertion_id} not found, skipping ${patch.id}`);
      continue;
    }

    // Build successor by applying the patch delta to the predecessor
    const successor: Assertion = {
      ...fromAssertion,
      id: newId("asr"),
      parent_id: fromAssertion.id,
      root_id: fromAssertion.root_id,
      version: fromAssertion.version + 1,
      created_at: now(),
    };

    for (const change of patch.changes) {
      (successor as unknown as Record<string, unknown>)[change.field] = change.to;
    }

    const message = await prompt(`Commit message for ${patch.id} (or enter to use reason): `);

    const commitRecord = {
      id: newId("cmt"),
      patch_id: patch.id,
      from_assertion_id: fromAssertion.id,
      to_assertion_id: successor.id,
      message: message.trim() || patch.reason,
      created_at: now(),
    };

    store.assertions.push(successor);
    patch.status = "committed";
    store.commits.push(commitRecord);

    console.log(`  Committed: ${commitRecord.id}`);
    console.log(`  "${fromAssertion.subject} ${fromAssertion.relation} ${fromAssertion.object}" v${fromAssertion.version} → v${successor.version}`);
    for (const c of patch.changes) {
      console.log(`    ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    }
  }

  await writeStore(store);
  console.log("\nDone. Run `reason log` to see history.");
}
