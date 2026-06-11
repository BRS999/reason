import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt } from "../ui.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

export async function eval_(args: string[]) {
  const store = await readStore();

  const active = store.assertions.filter((a) => a.status === "active" || a.status === "revised");
  if (active.length === 0) {
    console.log("No active assertions to evaluate.");
    return;
  }

  console.log("Record an outcome\n");

  const idArg = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  if (!idArg) {
    console.error("Error: assertion ID required. Usage: reason eval <assertion-id>");
    console.error("  Find IDs with: reason status --json");
    process.exit(1);
  }
  let assertion = active.find((a) => a.id === idArg);
  if (!assertion) {
    console.error(`No active assertion found with id: ${idArg}`);
    process.exit(1);
  }
  if (assertion) {
    console.log(`  ${assertion.subject} ${assertion.relation} ${assertion.object} @ ${assertion.confidence}`);
  }

  // Auto-resolve open actions on this assertion
  const openActions = store.actions.filter(
    (a) => a.assertion_id === assertion!.id && a.status === "open"
  );
  const actionId: string | null = openActions.length > 0 ? openActions[0].id : null;
  if (actionId) {
    console.log(`  Auto-resolving action: ${openActions[0].description}`);
  }

  const descriptionFlag = flag(args, "--description");
  const description = descriptionFlag ?? await prompt("\nDescribe what happened: ");

  const resultFlag = flag(args, "--result");
  const resultRaw = resultFlag ?? await prompt("Result (c=confirmed / r=refuted / a=ambiguous): ");

  const resultMap: Record<string, "confirmed" | "refuted" | "ambiguous"> = {
    c: "confirmed",
    r: "refuted",
    a: "ambiguous",
  };
  const result = resultMap[resultRaw.trim().toLowerCase()];
  if (!result) {
    console.error("Invalid result. Must be c, r, or a.");
    process.exit(1);
  }

  const actualValue = result === "confirmed" ? 1.0 : result === "refuted" ? 0.0 : 0.5;
  const calibrationDelta = actualValue - assertion.confidence;

  const outcome = {
    id: newId("out"),
    assertion_id: assertion.id,
    action_id: actionId,
    description: description.trim(),
    result,
    calibration_delta: Math.round(calibrationDelta * 1000) / 1000,
    created_at: now(),
  };

  store.outcomes.push(outcome);

  // resolve the linked action
  if (actionId) {
    const action = store.actions.find((a) => a.id === actionId);
    if (action) {
      action.status = "resolved";
      action.outcome_id = outcome.id;
      action.resolved_at = now();
    }
  }

  await writeStore(store);

  const calibrationMsg =
    calibrationDelta > 0.2
      ? "Underconfident — confidence was lower than reality."
      : calibrationDelta < -0.2
      ? "Overconfident — confidence was higher than reality."
      : "Well-calibrated.";

  console.log(`\nOutcome recorded: ${outcome.id}`);
  console.log(`  Result: ${result}`);
  console.log(`  Calibration delta: ${outcome.calibration_delta > 0 ? "+" : ""}${outcome.calibration_delta}  (${calibrationMsg})`);
  if (actionId) console.log(`  Action resolved: ${actionId}`);
  console.log("\nConsider running `reason patch` to revise confidence based on this outcome.");
}
