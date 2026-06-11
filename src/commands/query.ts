import { readStore } from "../db/store.ts";
import { assertionState } from "../db/graph.ts";

export async function query(args: string[]) {
  const store = await readStore();

  const json = args.includes("--json");
  const explain = args.includes("--explain");
  const term = args.filter((a) => !a.startsWith("--")).join(" ").toLowerCase().trim();

  if (!term) {
    console.log("Usage: reason query <keyword> [--json] [--explain]");
    return;
  }

  const byId = new Map(store.assertions.map(a => [a.id, a]));

  const directAssertions = store.assertions.filter((a) =>
    [a.subject, a.relation, a.object].some((f) => f.toLowerCase().includes(term))
  );
  const directIds = new Set(directAssertions.map(a => a.id));

  const evidenceAssertions = store.assertions.filter((a) =>
    !directIds.has(a.id) && a.evidence?.toLowerCase().includes(term)
  );

  const matchedObs = store.observations.filter((o) =>
    o.content.toLowerCase().includes(term) || o.source.toLowerCase().includes(term)
  );
  const matchedObsIds = new Set(matchedObs.map(o => o.id));

  const obsLinkedIds = new Set(
    store.patches
      .filter(p => p.observation_id && matchedObsIds.has(p.observation_id))
      .map(p => p.assertion_id)
  );
  const obsRelatedAssertions = store.assertions.filter(
    a => obsLinkedIds.has(a.id) && !directIds.has(a.id) && !evidenceAssertions.find(e => e.id === a.id)
  );

  const matchedCommits = store.commits.filter((c) => {
    const from = byId.get(c.from_assertion_id);
    return c.message.toLowerCase().includes(term) ||
      (from && (from.subject.toLowerCase().includes(term) || from.object.toLowerCase().includes(term)));
  });

  const matchedActions = store.actions.filter((a) =>
    a.description.toLowerCase().includes(term) ||
    a.type.toLowerCase().includes(term) ||
    JSON.stringify(a.metadata).toLowerCase().includes(term)
  );

  if (json) {
    console.log(JSON.stringify({
      term,
      direct_assertions: directAssertions.map(a => ({
        id: a.id, version: a.version, subject: a.subject, relation: a.relation,
        object: a.object, confidence: a.confidence, state: assertionState(a, store),
        evidence: a.evidence,
      })),
      evidence_assertions: evidenceAssertions.map(a => ({
        id: a.id, version: a.version, subject: a.subject, relation: a.relation,
        object: a.object, confidence: a.confidence, state: assertionState(a, store),
      })),
      observation_linked_assertions: obsRelatedAssertions.map(a => ({
        id: a.id, version: a.version, subject: a.subject, relation: a.relation,
        object: a.object, confidence: a.confidence, state: assertionState(a, store),
      })),
      commits: matchedCommits.map(c => ({ id: c.id, date: c.created_at.slice(0, 10), message: c.message })),
      observations: matchedObs.map(o => ({ id: o.id, date: o.created_at.slice(0, 10), content: o.content, source: o.source })),
      actions: matchedActions.map(a => ({ id: a.id, type: a.type, status: a.status, description: a.description, assertion_id: a.assertion_id })),
    }, null, 2));
    return;
  }

  const total = directAssertions.length + evidenceAssertions.length + obsRelatedAssertions.length +
    matchedCommits.length + matchedObs.length + matchedActions.length;

  console.log(`\nQuery: "${term}"\n`);

  const printAssertion = (a: typeof directAssertions[0], reason?: string) => {
    const state = assertionState(a, store);
    const indicator = a.confidence >= 0.7 ? "▲" : a.confidence >= 0.4 ? "◆" : "▼";
    console.log(`  ${indicator} [${state}] ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}  v${a.version}`);
    if (explain && reason) console.log(`    matched on: ${reason}`);
    console.log(`    id: ${a.id}`);
  };

  if (directAssertions.length > 0) {
    console.log(`Assertions — direct match (${directAssertions.length}):`);
    for (const a of directAssertions) printAssertion(a, "subject/relation/object");
  }

  if (evidenceAssertions.length > 0) {
    console.log(`\nAssertions — matched via evidence (${evidenceAssertions.length}):`);
    for (const a of evidenceAssertions) printAssertion(a, "evidence text");
  }

  if (obsRelatedAssertions.length > 0) {
    console.log(`\nAssertions — related via observation (${obsRelatedAssertions.length}):`);
    for (const a of obsRelatedAssertions) printAssertion(a, "linked via observation");
  }

  if (matchedCommits.length > 0) {
    console.log(`\nRevision history (${matchedCommits.length}):`);
    for (const c of matchedCommits) {
      console.log(`  ${c.created_at.slice(0, 10)}  ${c.id}  "${c.message}"`);
    }
  }

  if (matchedObs.length > 0) {
    console.log(`\nObservations (${matchedObs.length}):`);
    for (const o of matchedObs) {
      console.log(`  ${o.created_at.slice(0, 10)}  ${o.content.slice(0, 80)}`);
    }
  }

  if (matchedActions.length > 0) {
    console.log(`\nActions (${matchedActions.length}):`);
    for (const a of matchedActions) {
      const assertion = byId.get(a.assertion_id);
      const claim = assertion ? `${assertion.subject} ${assertion.relation} ${assertion.object}` : a.assertion_id;
      console.log(`  [${a.type}] [${a.status}] ${a.description.slice(0, 60)}  → ${claim}`);
    }
  }

  if (total === 0) console.log("No results.");
}
