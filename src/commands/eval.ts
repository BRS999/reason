import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt, selectFrom } from "../ui.ts";

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
  let assertion = idArg ? active.find((a) => a.id === idArg) : undefined;
  if (idArg && !assertion) {
    console.error(`No active assertion found with id: ${idArg}`);
    process.exit(1);
  }
  if (!assertion) {
    assertion = await selectFrom(
      active,
      (a) => `${a.id}  ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}`,
      "Which assertion does this outcome relate to?"
    );
  } else {
    console.log(`  ${assertion.subject} ${assertion.relation} ${assertion.object} @ ${assertion.confidence}`);
  }

  // Show open actions on this assertion
  const openActions = store.actions.filter(
    (a) => a.assertion_id === assertion!.id && a.status === "open"
  );
  let actionId: string | null = null;
  if (openActions.length > 0) {
    console.log(`\n  Open actions on this assertion:`);
    for (const a of openActions) {
      console.log(`    [${a.type}] ${a.description}`);
      if (Object.keys(a.metadata).length > 0) {
        console.log(`    metadata: ${JSON.stringify(a.metadata)}`);
      }
    }
    const linkAction = await prompt("\nLink outcome to an action? (y/n): ");
    if (linkAction.trim().toLowerCase() === "y") {
      const selected = await selectFrom(
        openActions,
        (a) => `${a.id}  [${a.type}] ${a.description}`,
        "Select action"
      );
      actionId = selected.id;
    }
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
