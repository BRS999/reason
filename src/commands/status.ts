import { readStore } from "../db/store.ts";

export async function status(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");

  if (json) {
    const active = store.assertions.filter((a) => a.status === "active");
    const revised = store.assertions.filter((a) => a.status === "revised");
    const invalidated = store.assertions.filter((a) => a.status === "invalidated");
    const pending = store.patches.filter((p) => p.status === "pending");
    const approved = store.patches.filter((p) => p.status === "approved");
    const avgDelta = store.outcomes.length
      ? store.outcomes.reduce((s, o) => s + o.calibration_delta, 0) / store.outcomes.length
      : null;
    const openActions = store.actions.filter((a) => a.status === "open");
    console.log(JSON.stringify({
      assertions: { active: active.length, revised: revised.length, invalidated: invalidated.length },
      observations: store.observations.length,
      patches: { pending: pending.length, approved: approved.length },
      commits: store.commits.length,
      outcomes: store.outcomes.length,
      actions: { open: openActions.length, total: store.actions.length },
      calibration: avgDelta !== null ? { avg_delta: Math.round(avgDelta * 1000) / 1000 } : null,
      active_assertions: active.sort((a, b) => b.confidence - a.confidence).map((a) => ({
        id: a.id,
        subject: a.subject,
        relation: a.relation,
        object: a.object,
        confidence: a.confidence,
        status: a.status,
      })),
    }, null, 2));
    return;
  }

  const active = store.assertions.filter((a) => a.status === "active");
  const revised = store.assertions.filter((a) => a.status === "revised");
  const invalidated = store.assertions.filter((a) => a.status === "invalidated");
  const pending = store.patches.filter((p) => p.status === "pending");
  const approved = store.patches.filter((p) => p.status === "approved");
  const openActions = store.actions.filter((a) => a.status === "open");

  console.log("Worldview Status\n");
  console.log(`  Assertions:   ${active.length} active, ${revised.length} revised, ${invalidated.length} invalidated`);
  console.log(`  Observations: ${store.observations.length}`);
  console.log(`  Patches:      ${pending.length} pending, ${approved.length} approved`);
  console.log(`  Commits:      ${store.commits.length}`);
  console.log(`  Outcomes:     ${store.outcomes.length}`);
  console.log(`  Actions:      ${openActions.length} open, ${store.actions.length} total`);

  if (active.length > 0) {
    console.log("\nActive assertions:");
    const sorted = [...active].sort((a, b) => b.confidence - a.confidence);
    for (const a of sorted) {
      const bar = "█".repeat(Math.round(a.confidence * 10)).padEnd(10, "░");
      console.log(`  ${bar}  ${(a.confidence * 100).toFixed(0).padStart(3)}%  ${a.subject} ${a.relation} ${a.object}`);
    }
  }

  if (openActions.length > 0) {
    console.log(`\nOpen actions:`);
    for (const a of openActions) {
      const assertion = store.assertions.find((x) => x.id === a.assertion_id);
      const claim = assertion ? `${assertion.subject} ${assertion.relation} ${assertion.object}` : a.assertion_id;
      console.log(`  [${a.type}] ${a.description.slice(0, 60)}  → ${claim}`);
    }
  }

  if (pending.length > 0) {
    console.log(`\n${pending.length} pending patch(es). Run \`reason review\` to process.`);
  }

  if (approved.length > 0) {
    console.log(`\n${approved.length} approved patch(es) ready. Run \`reason commit\` to apply.`);
  }

  if (store.outcomes.length > 0) {
    const avgDelta = store.outcomes.reduce((s, o) => s + o.calibration_delta, 0) / store.outcomes.length;
    const bias = avgDelta > 0.1 ? "underconfident" : avgDelta < -0.1 ? "overconfident" : "well-calibrated";
    console.log(`\nCalibration: avg delta ${avgDelta > 0 ? "+" : ""}${avgDelta.toFixed(3)} (${bias})`);
  }
}
