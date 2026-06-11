import type { Assertion, AssertionState } from "../types.ts";
import type { Store } from "./store.ts";

export function assertionState(assertion: Assertion, store: Store): AssertionState {
  if (store.assertions.some(a => a.parent_id === assertion.id)) return "superseded";
  if (store.outcomes.some(o => o.assertion_id === assertion.id)) return "evaluated";
  if (store.actions.some(a => a.assertion_id === assertion.id && a.status === "open")) return "under_test";
  return "current";
}

// Returns all assertions in a lineage, oldest first
export function assertionChain(assertionId: string, store: Store): Assertion[] {
  // Find root by walking up parent_id
  const byId = new Map(store.assertions.map(a => [a.id, a]));
  let node = byId.get(assertionId);
  if (!node) return [];

  // Walk to root
  while (node.parent_id) {
    node = byId.get(node.parent_id);
    if (!node) break;
  }
  if (!node) return [];

  // Walk down from root following children
  const chain: Assertion[] = [];
  let current: Assertion | undefined = node;
  while (current) {
    chain.push(current);
    current = store.assertions.find(a => a.parent_id === current!.id);
  }
  return chain;
}

// Current tip of a lineage — the assertion with no successor
export function currentAssertion(rootId: string, store: Store): Assertion | undefined {
  return store.assertions
    .filter(a => a.root_id === rootId)
    .find(a => !store.assertions.some(b => b.parent_id === a.id));
}

// All lineage tips (one per root) — the "active worldview"
export function currentAssertions(store: Store): Assertion[] {
  const roots = [...new Set(store.assertions.map(a => a.root_id))];
  return roots.flatMap(r => {
    const tip = currentAssertion(r, store);
    return tip ? [tip] : [];
  });
}
