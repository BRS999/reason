import { readStore } from "../db/store.ts";

export async function failures(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");

  if (store.outcomes.length === 0) {
    console.log(json ? "[]" : "No outcomes recorded yet.");
    return;
  }

  const byId = new Map(store.assertions.map(a => [a.id, a]));

  const byAssertion: Record<string, { refuted: number; confirmed: number; ambiguous: number }> = {};
  for (const o of store.outcomes) {
    if (!byAssertion[o.assertion_id]) byAssertion[o.assertion_id] = { refuted: 0, confirmed: 0, ambiguous: 0 };
    byAssertion[o.assertion_id][o.result]++;
  }

  const failed = Object.entries(byAssertion)
    .filter(([, counts]) => counts.refuted > 0)
    .sort((a, b) => b[1].refuted - a[1].refuted);

  if (json) {
    console.log(JSON.stringify(
      failed.map(([id, counts]) => {
        const a = byId.get(id);
        return {
          assertion_id: id,
          version: a?.version,
          claim: a ? `${a.subject} ${a.relation} ${a.object}` : "(unknown)",
          confidence: a?.confidence,
          refuted: counts.refuted,
          confirmed: counts.confirmed,
          ambiguous: counts.ambiguous,
        };
      }),
      null, 2
    ));
    return;
  }

  if (failed.length === 0) {
    console.log("No refuted assertions yet.");
    return;
  }

  console.log("Failure Report\n");
  console.log(`  ${failed.length} assertion(s) with at least one refuted outcome.\n`);

  for (const [id, counts] of failed) {
    const a = byId.get(id);
    const claim = a ? `${a.subject} ${a.relation} ${a.object}` : id;
    const conf = a ? ` @ ${a.confidence}` : "";
    const ver = a ? ` v${a.version}` : "";
    console.log(`  ✗ ${claim}${conf}${ver}`);
    console.log(`    ${counts.refuted} refuted, ${counts.confirmed} confirmed, ${counts.ambiguous} ambiguous`);
    console.log(`    id: ${id}`);
  }
}
