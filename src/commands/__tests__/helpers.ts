import type { Store } from "../../db/store.ts";
import type { Assertion, EpistemicPatch, Action, Outcome } from "../../types.ts";

export function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    assertions: [],
    observations: [],
    patches: [],
    commits: [],
    outcomes: [],
    actions: [],
    ...overrides,
  };
}

export function makeAssertion(overrides: Partial<Assertion> = {}): Assertion {
  return {
    id: "asr_1",
    subject: "US inflation",
    relation: "is",
    object: "decelerating",
    confidence: 0.7,
    evidence: "3 consecutive below-consensus CPI prints",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makePatch(overrides: Partial<EpistemicPatch> = {}): EpistemicPatch {
  return {
    id: "ptch_1",
    assertion_id: "asr_1",
    observation_id: null,
    changes: [{ field: "confidence", from: 0.7, to: 0.85 }],
    reason: "new data supports stronger view",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "act_1",
    assertion_id: "asr_1",
    type: "trade",
    description: "Short GLD",
    metadata: {},
    status: "open",
    outcome_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    resolved_at: null,
    ...overrides,
  };
}

export function makeOutcome(overrides: Partial<Outcome> = {}): Outcome {
  return {
    id: "out_1",
    assertion_id: "asr_1",
    action_id: null,
    description: "CPI confirmed trend",
    result: "confirmed",
    calibration_delta: 0.3,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
