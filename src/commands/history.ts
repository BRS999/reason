import { readStore } from "../db/store.ts";
import { assertionChain, assertionState } from "../db/graph.ts";

export async function history(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");
  const idArg = args.find(a => !a.startsWith("--"));

  if (!idArg) {
    console.error("Usage: reason history <assertion-id>");
    process.exit(1);
  }

  const chain = assertionChain(idArg, store);
  if (chain.length === 0) {
    console.error(`No assertion found with id: ${idArg}`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(chain.map(a => {
      const outcome = store.outcomes.find(o => o.assertion_id === a.id);
      const commit = store.commits.find(c => c.from_assertion_id === a.id);
      return {
        id: a.id,
        version: a.version,
        parent_id: a.parent_id,
        root_id: a.root_id,
        subject: a.subject,
        relation: a.relation,
        object: a.object,
        confidence: a.confidence,
        evidence: a.evidence,
        created_at: a.created_at,
        state: assertionState(a, store),
        outcome: outcome ? { result: outcome.result, calibration_delta: outcome.calibration_delta } : null,
        commit_message: commit?.message ?? null,
      };
    }), null, 2));
    return;
  }

  const root = chain[0];
  console.log(`\nLineage: ${root.subject} ${root.relation} ${root.object}`);
  console.log(`Root:    ${root.root_id}\n`);

  for (const a of chain) {
    const outcome = store.outcomes.find(o => o.assertion_id === a.id);
    const commit = store.commits.find(c => c.from_assertion_id === a.id);
    const state = assertionState(a, store);
    const isTip = state !== "superseded";

    console.log(`  v${a.version}  ${a.created_at.slice(0, 10)}  ${a.id}${isTip ? "  ← current" : ""}`);
    console.log(`       confidence: ${a.confidence}`);
    if (a.evidence) console.log(`       evidence:   ${a.evidence.slice(0, 80)}`);
    if (outcome) {
      const sign = outcome.calibration_delta > 0 ? "+" : "";
      console.log(`       outcome:    ${outcome.result}  (Δ ${sign}${outcome.calibration_delta})`);
    }
    if (commit) {
      console.log(`       commit:     "${commit.message}"`);
    }
    if (!isTip) console.log(`       ↓`);
    console.log();
  }
}
