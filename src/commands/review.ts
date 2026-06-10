import { readStore, writeStore } from "../db/store.ts";
import { prompt } from "../ui.ts";

export async function review(args: string[]) {
  const store = await readStore();
  const approveAll = args.includes("--approve-all");

  const pending = store.patches.filter((p) => p.status === "pending");
  if (pending.length === 0) {
    console.log("No pending patches.");
    return;
  }

  for (const patch of pending) {
    const assertion = store.assertions.find((a) => a.id === patch.assertion_id);
    const obs = patch.observation_id ? store.observations.find((o) => o.id === patch.observation_id) : null;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`Patch:      ${patch.id}`);
    console.log(`Created:    ${patch.created_at}`);
    console.log(`Assertion:  ${assertion ? `${assertion.subject} ${assertion.relation} ${assertion.object}` : patch.assertion_id}`);
    if (obs) console.log(`Observation: ${obs.content.slice(0, 80)}`);
    console.log(`Reason:     ${patch.reason}`);
    console.log("Changes:");
    for (const c of patch.changes) {
      console.log(`  ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    }

    if (approveAll) {
      patch.status = "approved";
      console.log("Auto-approved (--approve-all).");
      continue;
    }

    const decision = await prompt("\nApprove? (a=approve / r=reject / s=skip): ");
    const d = decision.trim().toLowerCase();

    if (d === "a") {
      patch.status = "approved";
      console.log("Approved. Run `reason commit` to apply.");
    } else if (d === "r") {
      patch.status = "rejected";
      console.log("Rejected.");
    } else {
      console.log("Skipped.");
    }
  }

  await writeStore(store);
}
