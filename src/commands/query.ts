import { readStore } from "../db/store.ts";
import type { Assertion } from "../types.ts";

function matchFields(term: string, fields: string[]): string[] {
  return fields.filter((f) => f && f.toLowerCase().includes(term));
}

function explainAssertion(term: string, a: Assertion): string {
  const hits: string[] = [];
  if (a.subject.toLowerCase().includes(term)) hits.push(`subject "${a.subject}"`);
  if (a.object.toLowerCase().includes(term)) hits.push(`object "${a.object}"`);
  if (a.relation.toLowerCase().includes(term)) hits.push(`relation "${a.relation}"`);
  if (a.evidence?.toLowerCase().includes(term)) hits.push("evidence");
  if (a.status.toLowerCase().includes(term)) hits.push("status");
  return hits.join(", ");
}

export async function query(args: string[]) {
  const store = await readStore();

  const json = args.includes("--json");
  const explain = args.includes("--explain");
  const term = args.filter((a) => !a.startsWith("--")).join(" ").toLowerCase().trim();

  if (!term) {
    console.log("Usage: reason query <keyword> [--json] [--explain]");
    console.log("Examples:");
    console.log("  reason query stablecoin");
    console.log("  reason query BTC --explain");
    console.log("  reason query predicts --json");
    return;
  }

  // Direct matches
  const directAssertions = store.assertions.filter((a) =>
    [a.subject, a.relation, a.object, a.status].some((f) => f.toLowerCase().includes(term))
  );
  const directAssertionIds = new Set(directAssertions.map((a) => a.id));

  // Assertions matched only via evidence
  const evidenceAssertions = store.assertions.filter((a) =>
    !directAssertionIds.has(a.id) && a.evidence?.toLowerCase().includes(term)
  );

  // Observations that match
  const matchedObs = store.observations.filter((o) =>
    o.content.toLowerCase().includes(term) || o.source.toLowerCase().includes(term)
  );
  const matchedObsIds = new Set(matchedObs.map((o) => o.id));

  // Assertions related via observation (obs mentions term, obs was linked via patch)
  const obsLinkedAssertionIds = new Set(
    store.patches
      .filter((p) => p.observation_id && matchedObsIds.has(p.observation_id))
      .map((p) => p.assertion_id)
  );
  const obsRelatedAssertions = store.assertions.filter(
    (a) => obsLinkedAssertionIds.has(a.id) && !directAssertionIds.has(a.id) && !evidenceAssertions.find((e) => e.id === a.id)
  );

  // Commits
  const matchedCommits = store.commits.filter((c) =>
    c.message.toLowerCase().includes(term) ||
    c.snapshot_before.subject.toLowerCase().includes(term) ||
    c.snapshot_before.object.toLowerCase().includes(term)
  );

  // Actions
  const matchedActions = store.actions.filter((a) =>
    a.description.toLowerCase().includes(term) ||
    a.type.toLowerCase().includes(term) ||
    JSON.stringify(a.metadata).toLowerCase().includes(term)
  );

  if (json) {
    console.log(JSON.stringify({
      term,
      direct_assertions: directAssertions.map((a) => ({
        id: a.id, subject: a.subject, relation: a.relation, object: a.object,
        confidence: a.confidence, status: a.status, evidence: a.evidence,
        match_reason: explain ? explainAssertion(term, a) : undefined,
      })),
      evidence_assertions: evidenceAssertions.map((a) => ({
        id: a.id, subject: a.subject, relation: a.relation, object: a.object,
        confidence: a.confidence, status: a.status,
        match_reason: explain ? "evidence text" : undefined,
      })),
      observation_linked_assertions: obsRelatedAssertions.map((a) => ({
        id: a.id, subject: a.subject, relation: a.relation, object: a.object,
        confidence: a.confidence, status: a.status,
        match_reason: explain ? "linked via observation" : undefined,
      })),
      commits: matchedCommits.map((c) => ({
        id: c.id, date: c.created_at.slice(0, 10), message: c.message,
      })),
      observations: matchedObs.map((o) => ({
        id: o.id, date: o.created_at.slice(0, 10), content: o.content, source: o.source,
      })),
      actions: matchedActions.map((a) => ({
        id: a.id, type: a.type, status: a.status, description: a.description,
        assertion_id: a.assertion_id, metadata: a.metadata,
      })),
    }, null, 2));
    return;
  }

  const total = directAssertions.length + evidenceAssertions.length + obsRelatedAssertions.length +
    matchedCommits.length + matchedObs.length + matchedActions.length;

  console.log(`\nQuery: "${term}"\n`);

  if (directAssertions.length > 0) {
    console.log(`Assertions — direct match (${directAssertions.length}):`);
    for (const a of directAssertions) {
      const indicator = a.confidence >= 0.7 ? "▲" : a.confidence >= 0.4 ? "◆" : "▼";
      console.log(`  ${indicator} [${a.status}] ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}`);
      if (explain) console.log(`    matched on: ${explainAssertion(term, a)}`);
      console.log(`    id: ${a.id}`);
    }
  }

  if (evidenceAssertions.length > 0) {
    console.log(`\nAssertions — matched via evidence (${evidenceAssertions.length}):`);
    for (const a of evidenceAssertions) {
      const indicator = a.confidence >= 0.7 ? "▲" : a.confidence >= 0.4 ? "◆" : "▼";
      console.log(`  ${indicator} [${a.status}] ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}`);
      if (explain) {
        const idx = a.evidence.toLowerCase().indexOf(term);
        const snip = a.evidence.slice(Math.max(0, idx - 20), idx + 40).replace(/\n/g, " ");
        console.log(`    matched in evidence: "...${snip}..."`);
      }
      console.log(`    id: ${a.id}`);
    }
  }

  if (obsRelatedAssertions.length > 0) {
    console.log(`\nAssertions — related via observation (${obsRelatedAssertions.length}):`);
    for (const a of obsRelatedAssertions) {
      const indicator = a.confidence >= 0.7 ? "▲" : a.confidence >= 0.4 ? "◆" : "▼";
      console.log(`  ${indicator} [${a.status}] ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}`);
      if (explain) console.log(`    linked via a patch that referenced a matching observation`);
      console.log(`    id: ${a.id}`);
    }
  }

  if (matchedCommits.length > 0) {
    console.log(`\nRevision history (${matchedCommits.length}):`);
    for (const c of matchedCommits) {
      console.log(`  ${c.created_at.slice(0, 10)}  ${c.id}  "${c.message}"`);
      if (explain) {
        const via = c.message.toLowerCase().includes(term) ? "commit message"
          : c.snapshot_before.subject.toLowerCase().includes(term) ? `assertion subject "${c.snapshot_before.subject}"`
          : `assertion object "${c.snapshot_before.object}"`;
        console.log(`    matched on: ${via}`);
      }
    }
  }

  if (matchedObs.length > 0) {
    console.log(`\nObservations (${matchedObs.length}):`);
    for (const o of matchedObs) {
      console.log(`  ${o.created_at.slice(0, 10)}  ${o.content.slice(0, 80)}`);
      if (explain) {
        const via = o.content.toLowerCase().includes(term) ? "content" : `source "${o.source}"`;
        console.log(`    matched on: ${via}`);
      }
    }
  }

  if (matchedActions.length > 0) {
    console.log(`\nActions (${matchedActions.length}):`);
    for (const a of matchedActions) {
      const assertion = store.assertions.find((x) => x.id === a.assertion_id);
      const claim = assertion ? `${assertion.subject} ${assertion.relation} ${assertion.object}` : a.assertion_id;
      console.log(`  [${a.type}] [${a.status}] ${a.description.slice(0, 60)}`);
      if (explain) {
        const via = a.description.toLowerCase().includes(term) ? "description"
          : a.type.toLowerCase().includes(term) ? "type"
          : "metadata";
        console.log(`    matched on: ${via}`);
      }
      console.log(`    assertion: ${claim}`);
      console.log(`    id: ${a.id}`);
    }
  }

  if (total === 0) {
    console.log("No results.");
  }
}
