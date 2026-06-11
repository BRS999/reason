import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt } from "../ui.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

export async function eval_(args: string[]) {
  const store = await readStore();

  const eligible = store.assertions.filter((a) =>
    !store.assertions.some(b => b.parent_id === a.id) &&
    !store.outcomes.some(o => o.assertion_id === a.id)
  );

  if (eligible.length === 0) {
    console.log("No assertions available to evaluate. All current assertions have already been evaluated or superseded.");
    return;
  }

  console.log("Record an outcome\n");

  const idArg = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  if (!idArg) {
    console.error("Error: assertion ID required. Usage: reason eval <assertion-id>");
    console.error("  Find IDs with: reason status --json");
    process.exit(1);
  }

  const assertion = eligible.find((a) => a.id === idArg);
  if (!assertion) {
    if (store.outcomes.some(o => o.assertion_id === idArg)) {
      console.error(`Assertion ${idArg} has already been evaluated. Use \`reason history ${idArg}\` to see its lineage, or \`reason patch ${idArg}\` to propose a successor.`);
    } else {
      console.error(`No evaluable assertion found with id: ${idArg}`);
    }
    process.exit(1);
  }

  console.log(`  ${assertion.subject} ${assertion.relation} ${assertion.object} @ ${assertion.confidence}  (v${assertion.version})`);

  const openActions = store.actions.filter(
    (a) => a.assertion_id === assertion.id && a.status === "open"
  );
  if (openActions.length > 0) {
    for (const a of openActions) console.log(`  Auto-resolving action: ${a.description}`);
  }

  const description = flag(args, "--description") ?? await prompt("\nDescribe what happened: ");
  const resultRaw = flag(args, "--result") ?? await prompt("Result (c=confirmed / r=refuted / a=ambiguous): ");

  const resultMap: Record<string, "confirmed" | "refuted" | "ambiguous"> = {
    c: "confirmed", r: "refuted", a: "ambiguous",
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
    action_id: openActions.length > 0 ? openActions[0].id : null,
    description: description.trim(),
    result,
    calibration_delta: Math.round(calibrationDelta * 1000) / 1000,
    created_at: now(),
  };

  store.outcomes.push(outcome);

  const resolvedAt = now();
  for (const action of openActions) {
    action.status = "resolved";
    action.outcome_id = outcome.id;
    action.resolved_at = resolvedAt;
  }

  await writeStore(store);

  const calibrationMsg =
    calibrationDelta > 0.2 ? "Underconfident — confidence was lower than reality."
    : calibrationDelta < -0.2 ? "Overconfident — confidence was higher than reality."
    : "Well-calibrated.";

  console.log(`\nOutcome recorded: ${outcome.id}`);
  console.log(`  Result: ${result}`);
  console.log(`  Calibration delta: ${outcome.calibration_delta > 0 ? "+" : ""}${outcome.calibration_delta}  (${calibrationMsg})`);
  for (const action of openActions) console.log(`  Action resolved: ${action.id}`);
  console.log("\nRun `reason patch` to propose a successor assertion.");
}
