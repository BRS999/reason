import { readStore } from "../db/store.ts";
import type { Outcome, Assertion } from "../types.ts";

export async function calibration(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");

  if (store.outcomes.length === 0) {
    if (json) {
      console.log(JSON.stringify({ outcomes: 0 }));
    } else {
      console.log("No outcomes recorded yet. Run `reason eval` after a thesis resolves.");
    }
    return;
  }

  const assertionMap = new Map<string, Assertion>(store.assertions.map((a) => [a.id, a]));

  // Overall stats
  const total = store.outcomes.length;
  const confirmed = store.outcomes.filter((o) => o.result === "confirmed").length;
  const refuted = store.outcomes.filter((o) => o.result === "refuted").length;
  const ambiguous = store.outcomes.filter((o) => o.result === "ambiguous").length;
  const avgDelta = store.outcomes.reduce((s, o) => s + o.calibration_delta, 0) / total;

  // By relation type
  const byRelation: Record<string, { count: number; totalDelta: number; confirmed: number; refuted: number }> = {};
  for (const o of store.outcomes) {
    const a = assertionMap.get(o.assertion_id);
    if (!a) continue;
    const rel = a.relation;
    if (!byRelation[rel]) byRelation[rel] = { count: 0, totalDelta: 0, confirmed: 0, refuted: 0 };
    byRelation[rel].count++;
    byRelation[rel].totalDelta += o.calibration_delta;
    if (o.result === "confirmed") byRelation[rel].confirmed++;
    if (o.result === "refuted") byRelation[rel].refuted++;
  }

  // Confidence bucket accuracy (buckets: 0-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
  const buckets = [
    { label: "low    (0.0–0.4)", min: 0, max: 0.4, outcomes: [] as Outcome[] },
    { label: "medium (0.4–0.6)", min: 0.4, max: 0.6, outcomes: [] as Outcome[] },
    { label: "high   (0.6–0.8)", min: 0.6, max: 0.8, outcomes: [] as Outcome[] },
    { label: "very high (0.8–1.0)", min: 0.8, max: 1.01, outcomes: [] as Outcome[] },
  ];

  for (const o of store.outcomes) {
    const a = assertionMap.get(o.assertion_id);
    if (!a) continue;
    for (const b of buckets) {
      if (a.confidence >= b.min && a.confidence < b.max) {
        b.outcomes.push(o);
        break;
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({
      total,
      confirmed,
      refuted,
      ambiguous,
      avg_calibration_delta: Math.round(avgDelta * 1000) / 1000,
      by_relation: Object.fromEntries(
        Object.entries(byRelation).map(([k, v]) => [k, {
          count: v.count,
          avg_delta: Math.round((v.totalDelta / v.count) * 1000) / 1000,
          confirmed: v.confirmed,
          refuted: v.refuted,
        }])
      ),
      confidence_buckets: buckets.map((b) => ({
        label: b.label,
        count: b.outcomes.length,
        confirmed: b.outcomes.filter((o) => o.result === "confirmed").length,
        refuted: b.outcomes.filter((o) => o.result === "refuted").length,
      })),
    }, null, 2));
    return;
  }

  const bias = avgDelta > 0.1 ? "underconfident" : avgDelta < -0.1 ? "overconfident" : "well-calibrated";

  console.log("Calibration Report\n");
  console.log(`  Outcomes:   ${total} total  (${confirmed} confirmed, ${refuted} refuted, ${ambiguous} ambiguous)`);
  console.log(`  Avg delta:  ${avgDelta > 0 ? "+" : ""}${avgDelta.toFixed(3)}  (${bias})`);

  console.log("\nBy relation type:");
  for (const [rel, stats] of Object.entries(byRelation).sort((a, b) => b[1].count - a[1].count)) {
    const avg = stats.totalDelta / stats.count;
    const biasMark = avg > 0.1 ? " ↑under" : avg < -0.1 ? " ↓over" : "";
    console.log(`  ${rel.padEnd(24)} ${stats.count}x  avg ${avg > 0 ? "+" : ""}${avg.toFixed(3)}${biasMark}  (${stats.confirmed}✓ ${stats.refuted}✗)`);
  }

  console.log("\nBy confidence bucket:");
  for (const b of buckets) {
    if (b.outcomes.length === 0) continue;
    const conf = b.outcomes.filter((o) => o.result === "confirmed").length;
    const ref = b.outcomes.filter((o) => o.result === "refuted").length;
    const pct = ((conf / b.outcomes.length) * 100).toFixed(0);
    console.log(`  ${b.label}  ${b.outcomes.length}x  confirmed ${pct}%  (${conf}✓ ${ref}✗)`);
  }
}
