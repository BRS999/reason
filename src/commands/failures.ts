import { readStore } from "../db/store.ts";

export async function failures(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");

  if (store.outcomes.length === 0) {
    if (json) {
      console.log(JSON.stringify([]));
    } else {
      console.log("No outcomes recorded yet.");
    }
    return;
  }

  const assertionMap = new Map(store.assertions.map((a) => [a.id, a]));

  // Group outcomes by assertion
  const byAssertion: Record<string, { refuted: number; confirmed: number; ambiguous: number }> = {};
  for (const o of store.outcomes) {
    if (!byAssertion[o.assertion_id]) byAssertion[o.assertion_id] = { refuted: 0, confirmed: 0, ambiguous: 0 };
    byAssertion[o.assertion_id][o.result]++;
  }

  // Assertions with at least one refutation, sorted by refuted count desc
  const failed = Object.entries(byAssertion)
    .filter(([, counts]) => counts.refuted > 0)
    .sort((a, b) => b[1].refuted - a[1].refuted);

  // Patches that were committed and later the assertion was refuted
  const refutedIds = new Set(failed.map(([id]) => id));
  const revisedAndRefuted = store.commits
    .filter((c) => refutedIds.has(c.assertion_id))
    .map((c) => ({
      commit: c,
      assertion: assertionMap.get(c.assertion_id),
      outcomes: store.outcomes.filter((o) => o.assertion_id === c.assertion_id && o.result === "refuted"),
    }));

  if (json) {
    console.log(JSON.stringify(
      failed.map(([id, counts]) => {
        const a = assertionMap.get(id);
        return {
          assertion_id: id,
          claim: a ? `${a.subject} ${a.relation} ${a.object}` : "(unknown)",
          current_confidence: a?.confidence,
          status: a?.status,
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
    const a = assertionMap.get(id);
    const claim = a ? `${a.subject} ${a.relation} ${a.object}` : id;
    const status = a ? ` [${a.status}]` : "";
    const conf = a ? ` @ ${a.confidence}` : "";
    console.log(`  ✗ ${claim}${conf}${status}`);
    console.log(`    ${counts.refuted} refuted, ${counts.confirmed} confirmed, ${counts.ambiguous} ambiguous`);
    console.log(`    id: ${id}`);
  }

  if (revisedAndRefuted.length > 0) {
    console.log("\nRevisions on later-refuted assertions:");
    for (const { commit, assertion } of revisedAndRefuted) {
      const claim = assertion ? `${assertion.subject} ${assertion.relation} ${assertion.object}` : commit.assertion_id;
      console.log(`  ${commit.created_at.slice(0, 10)}  ${commit.id}  "${commit.message}"  → ${claim}`);
    }
  }
}
