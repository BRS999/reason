import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt, displayAssertion } from "../ui.ts";
import type { PatchChange } from "../types.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

export async function patch(args: string[]) {
  const store = await readStore();

  const active = store.assertions.filter((a) => a.status === "active");
  if (active.length === 0) {
    console.log("No active assertions. Use `reason assert` to add one first.");
    return;
  }

  // Support non-flag first arg as ID, or --id flag
  const idArg = flag(args, "--id") ?? (args[0] && !args[0].startsWith("--") ? args[0] : undefined);

  console.log("Propose an epistemic patch\n");

  if (!idArg && !process.stdin.isTTY) {
    console.error("Error: assertion ID required. Usage: reason patch <assertion-id> [--confidence X] [--status S] [--append-evidence E] [--reason R]");
    console.error("  Find IDs with: reason status --json");
    process.exit(1);
  }
  let assertion = idArg ? active.find((a) => a.id === idArg) : undefined;
  if (idArg && !assertion) {
    console.error(`No active assertion found with id: ${idArg}`);
    process.exit(1);
  }
  if (!assertion) {
    assertion = await selectFrom(active, (a) => `${a.id}  ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}`, "Target assertion");
  } else {
    displayAssertion(assertion);
  }

  // Optionally link to an observation
  const obsFlag = flag(args, "--observation");
  let observationId: string | null = obsFlag ?? null;


  console.log("\nWhat would you like to change? (leave blank to skip)");

  const changes: PatchChange[] = [];

  const newConfidenceRaw = flag(args, "--confidence") ?? await prompt(`Confidence [current: ${assertion.confidence}]: `);
  if (newConfidenceRaw.trim()) {
    const val = parseFloat(newConfidenceRaw);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      changes.push({ field: "confidence", from: assertion.confidence, to: val });
    }
  }

  const newStatus = flag(args, "--status") ?? await prompt(`Status [current: ${assertion.status}] (active/revised/invalidated/archived or blank): `);
  if (newStatus.trim() && newStatus.trim() !== assertion.status) {
    changes.push({ field: "status", from: assertion.status, to: newStatus.trim() });
  }

  const appendEvidence = flag(args, "--append-evidence");
  const replaceEvidence = flag(args, "--replace-evidence");
  const newEvidence = replaceEvidence ?? appendEvidence ?? await prompt("Append to evidence (or blank): ");
  if (newEvidence.trim()) {
    const updated = replaceEvidence
      ? newEvidence.trim()
      : assertion.evidence ? `${assertion.evidence}\n${newEvidence.trim()}` : newEvidence.trim();
    changes.push({ field: "evidence", from: assertion.evidence, to: updated });
  }

  if (changes.length === 0) {
    console.log("No changes specified. Patch cancelled.");
    return;
  }

  const reason = flag(args, "--reason") ?? await prompt("\nReason for this patch: ");
  if (!reason.trim()) {
    console.log("A reason is required. Patch cancelled.");
    return;
  }

  const patch = {
    id: newId("ptch"),
    assertion_id: assertion.id,
    observation_id: observationId,
    changes,
    reason: reason.trim(),
    status: "pending" as const,
    created_at: now(),
  };

  store.patches.push(patch);
  await writeStore(store);

  console.log(`\nPatch proposed: ${patch.id}`);
  for (const c of changes) {
    console.log(`  ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  }
  console.log(`  Reason: ${reason.trim()}`);
  console.log("\nRun `reason review` to approve or reject.");
}
