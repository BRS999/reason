import { describe, it, expect } from "vitest";
import { assertionState, assertionChain, currentAssertion, currentAssertions } from "../graph.ts";
import { emptyStore } from "../store.ts";
import type { Assertion } from "../../types.ts";

function makeAssertion(overrides: Partial<Assertion> = {}): Assertion {
  return {
    id: "asr_1",
    parent_id: null,
    root_id: "asr_1",
    version: 1,
    subject: "inflation",
    relation: "is",
    object: "decelerating",
    confidence: 0.7,
    evidence: "CPI data",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assertionState
// ---------------------------------------------------------------------------

describe("assertionState", () => {
  it("returns current for a tip with no actions or outcomes", () => {
    const a = makeAssertion();
    expect(assertionState(a, { ...emptyStore(), assertions: [a] })).toBe("current");
  });

  it("returns superseded when a successor exists", () => {
    const a = makeAssertion({ id: "asr_1" });
    const b = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2 });
    const store = { ...emptyStore(), assertions: [a, b] };
    expect(assertionState(a, store)).toBe("superseded");
  });

  it("returns under_test when an open action exists", () => {
    const a = makeAssertion();
    const store = {
      ...emptyStore(),
      assertions: [a],
      actions: [{ id: "act_1", assertion_id: "asr_1", type: "trade", description: "Short", metadata: {}, status: "open" as const, outcome_id: null, created_at: "2026-01-01T00:00:00.000Z", resolved_at: null }],
    };
    expect(assertionState(a, store)).toBe("under_test");
  });

  it("returns evaluated when an outcome exists and no successor", () => {
    const a = makeAssertion();
    const store = {
      ...emptyStore(),
      assertions: [a],
      outcomes: [{ id: "out_1", assertion_id: "asr_1", action_id: null, description: "confirmed", result: "confirmed" as const, calibration_delta: 0.3, created_at: "2026-01-01T00:00:00.000Z" }],
    };
    expect(assertionState(a, store)).toBe("evaluated");
  });

  it("superseded takes priority over evaluated", () => {
    const a = makeAssertion({ id: "asr_1" });
    const b = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2 });
    const store = {
      ...emptyStore(),
      assertions: [a, b],
      outcomes: [{ id: "out_1", assertion_id: "asr_1", action_id: null, description: "confirmed", result: "confirmed" as const, calibration_delta: 0.3, created_at: "2026-01-01T00:00:00.000Z" }],
    };
    expect(assertionState(a, store)).toBe("superseded");
  });
});

// ---------------------------------------------------------------------------
// assertionChain
// ---------------------------------------------------------------------------

describe("assertionChain", () => {
  it("returns empty array for unknown id", () => {
    expect(assertionChain("nonexistent", emptyStore())).toHaveLength(0);
  });

  it("returns single-item chain for standalone assertion", () => {
    const a = makeAssertion();
    const store = { ...emptyStore(), assertions: [a] };
    const chain = assertionChain("asr_1", store);
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe("asr_1");
  });

  it("returns full chain oldest-first for v1→v2→v3", () => {
    const a1 = makeAssertion({ id: "asr_1" });
    const a2 = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2 });
    const a3 = makeAssertion({ id: "asr_3", parent_id: "asr_2", root_id: "asr_1", version: 3 });
    const store = { ...emptyStore(), assertions: [a1, a2, a3] };

    const chain = assertionChain("asr_3", store);
    expect(chain.map(a => a.id)).toEqual(["asr_1", "asr_2", "asr_3"]);
  });

  it("finds chain when queried from middle of lineage", () => {
    const a1 = makeAssertion({ id: "asr_1" });
    const a2 = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2 });
    const a3 = makeAssertion({ id: "asr_3", parent_id: "asr_2", root_id: "asr_1", version: 3 });
    const store = { ...emptyStore(), assertions: [a1, a2, a3] };

    const chain = assertionChain("asr_2", store);
    expect(chain.map(a => a.id)).toEqual(["asr_1", "asr_2", "asr_3"]);
  });
});

// ---------------------------------------------------------------------------
// currentAssertion
// ---------------------------------------------------------------------------

describe("currentAssertion", () => {
  it("returns undefined for unknown root", () => {
    expect(currentAssertion("nonexistent", emptyStore())).toBeUndefined();
  });

  it("returns the tip when there is a lineage", () => {
    const a1 = makeAssertion({ id: "asr_1" });
    const a2 = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2 });
    const store = { ...emptyStore(), assertions: [a1, a2] };
    expect(currentAssertion("asr_1", store)?.id).toBe("asr_2");
  });
});

// ---------------------------------------------------------------------------
// currentAssertions
// ---------------------------------------------------------------------------

describe("currentAssertions", () => {
  it("returns empty array for empty store", () => {
    expect(currentAssertions(emptyStore())).toHaveLength(0);
  });

  it("returns one tip per root", () => {
    const a1 = makeAssertion({ id: "asr_1", root_id: "asr_1" });
    const a2 = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2 });
    const b1 = makeAssertion({ id: "bsr_1", root_id: "bsr_1" });
    const store = { ...emptyStore(), assertions: [a1, a2, b1] };
    const tips = currentAssertions(store);
    expect(tips).toHaveLength(2);
    expect(tips.map(a => a.id).sort()).toEqual(["asr_2", "bsr_1"]);
  });
});
