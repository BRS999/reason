import { describe, it, expect } from "vitest";
import { diffStores, replayEvents, applyEvent } from "../events.ts";
import type { Store } from "../store.ts";
import type { Assertion, Observation, EpistemicPatch, Action, Outcome } from "../../types.ts";

function emptyStore(): Store {
  return { assertions: [], observations: [], patches: [], commits: [], outcomes: [], actions: [] };
}

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
    evidence: "3 consecutive below-consensus CPI prints",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs_1",
    content: "CPI came in at 2.9%",
    source: "BLS",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// diffStores
// ---------------------------------------------------------------------------

describe("diffStores — assertions", () => {
  it("emits assertion_created for new assertions", () => {
    const before = emptyStore();
    const after = { ...emptyStore(), assertions: [makeAssertion()] };
    const events = diffStores(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("assertion_created");
    expect((events[0] as any).payload.id).toBe("asr_1");
  });

  it("emits assertion_created for a successor assertion (new id)", () => {
    const a = makeAssertion({ id: "asr_1", confidence: 0.7 });
    const successor = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2, confidence: 0.85 });
    const before = { ...emptyStore(), assertions: [a] };
    const after = { ...emptyStore(), assertions: [a, successor] };
    const events = diffStores(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("assertion_created");
    expect((events[0] as any).payload.id).toBe("asr_2");
  });

  it("emits no events when assertion is unchanged", () => {
    const a = makeAssertion();
    const store = { ...emptyStore(), assertions: [a] };
    expect(diffStores(store, store)).toHaveLength(0);
  });

  it("emits no events when the same assertion exists in both stores", () => {
    const a = makeAssertion();
    const before = { ...emptyStore(), assertions: [a] };
    const after = { ...emptyStore(), assertions: [a] };
    expect(diffStores(before, after)).toHaveLength(0);
  });
});

describe("diffStores — observations", () => {
  it("emits observation_added for new observations", () => {
    const before = emptyStore();
    const after = { ...emptyStore(), observations: [makeObservation()] };
    const events = diffStores(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("observation_added");
  });

  it("does not re-emit existing observations", () => {
    const obs = makeObservation();
    const store = { ...emptyStore(), observations: [obs] };
    expect(diffStores(store, store)).toHaveLength(0);
  });
});

describe("diffStores — patches", () => {
  const patch: EpistemicPatch = {
    id: "ptch_1",
    assertion_id: "asr_1",
    observation_id: null,
    changes: [{ field: "confidence", from: 0.7, to: 0.85 }],
    reason: "new data",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("emits patch_proposed for new patches", () => {
    const before = emptyStore();
    const after = { ...emptyStore(), patches: [patch] };
    const events = diffStores(before, after);
    expect(events[0].type).toBe("patch_proposed");
  });

  it("emits patch_status_changed when status changes", () => {
    const before = { ...emptyStore(), patches: [patch] };
    const after = { ...emptyStore(), patches: [{ ...patch, status: "approved" as const }] };
    const events = diffStores(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("patch_status_changed");
    const payload = (events[0] as any).payload;
    expect(payload.from).toBe("pending");
    expect(payload.to).toBe("approved");
  });
});

describe("diffStores — actions", () => {
  const action: Action = {
    id: "act_1",
    assertion_id: "asr_1",
    type: "trade",
    description: "Short GLD",
    metadata: {},
    status: "open",
    outcome_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    resolved_at: null,
  };

  it("emits action_opened for new actions", () => {
    const before = emptyStore();
    const after = { ...emptyStore(), actions: [action] };
    const events = diffStores(before, after);
    expect(events[0].type).toBe("action_opened");
  });

  it("emits action_status_changed when status changes", () => {
    const before = { ...emptyStore(), actions: [action] };
    const after = { ...emptyStore(), actions: [{ ...action, status: "resolved" as const, resolved_at: "2026-02-01T00:00:00.000Z" }] };
    const events = diffStores(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("action_status_changed");
    const payload = (events[0] as any).payload;
    expect(payload.from).toBe("open");
    expect(payload.to).toBe("resolved");
  });
});

describe("diffStores — outcomes", () => {
  const outcome: Outcome = {
    id: "out_1",
    assertion_id: "asr_1",
    action_id: null,
    description: "CPI confirmed deceleration",
    result: "confirmed",
    calibration_delta: 0.05,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("emits outcome_recorded for new outcomes", () => {
    const before = emptyStore();
    const after = { ...emptyStore(), outcomes: [outcome] };
    const events = diffStores(before, after);
    expect(events[0].type).toBe("outcome_recorded");
  });
});

// ---------------------------------------------------------------------------
// replayEvents / applyEvent
// ---------------------------------------------------------------------------

describe("replayEvents", () => {
  it("rebuilds store from assertion_created events", () => {
    const a = makeAssertion();
    const before = emptyStore();
    const after = { ...emptyStore(), assertions: [a] };
    const events = diffStores(before, after);
    const replayed = replayEvents(events);
    expect(replayed.assertions).toHaveLength(1);
    expect(replayed.assertions[0].id).toBe("asr_1");
  });

  it("replays two assertion_created events as two entries", () => {
    const a1 = makeAssertion({ id: "asr_1", confidence: 0.7 });
    const a2 = makeAssertion({ id: "asr_2", parent_id: "asr_1", root_id: "asr_1", version: 2, confidence: 0.9 });
    const s1 = { ...emptyStore(), assertions: [a1] };
    const s2 = { ...emptyStore(), assertions: [a1, a2] };
    const events = [...diffStores(emptyStore(), s1), ...diffStores(s1, s2)];
    const replayed = replayEvents(events);
    expect(replayed.assertions).toHaveLength(2);
    expect(replayed.assertions[1].confidence).toBe(0.9);
  });

  it("applies patch_status_changed correctly", () => {
    const patch: EpistemicPatch = {
      id: "ptch_1", assertion_id: "asr_1", observation_id: null,
      changes: [], reason: "test", status: "pending",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const s1 = { ...emptyStore(), patches: [patch] };
    const s2 = { ...emptyStore(), patches: [{ ...patch, status: "approved" as const }] };
    const events = [...diffStores(emptyStore(), s1), ...diffStores(s1, s2)];
    const replayed = replayEvents(events);
    expect(replayed.patches[0].status).toBe("approved");
  });

  it("returns empty store for empty event list", () => {
    const store = replayEvents([]);
    expect(store.assertions).toHaveLength(0);
    expect(store.observations).toHaveLength(0);
  });
});

describe("replayEvents — commits, actions, outcomes", () => {
  it("replays commit_created", () => {
    const a = makeAssertion();
    const commit = {
      id: "cmt_1",
      patch_id: "ptch_1",
      from_assertion_id: a.id,
      to_assertion_id: "asr_2",
      message: "updated confidence",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const store = { ...emptyStore(), commits: [commit] };
    const replayed = replayEvents(diffStores(emptyStore(), store));
    expect(replayed.commits).toHaveLength(1);
    expect(replayed.commits[0].id).toBe("cmt_1");
  });

  it("replays action_opened and action_status_changed", () => {
    const action = {
      id: "act_1", assertion_id: "asr_1", type: "trade",
      description: "Short GLD", metadata: {}, status: "open" as const,
      outcome_id: null, created_at: "2026-01-01T00:00:00.000Z", resolved_at: null,
    };
    const s1 = { ...emptyStore(), actions: [action] };
    const s2 = { ...emptyStore(), actions: [{ ...action, status: "resolved" as const, resolved_at: "2026-02-01T00:00:00.000Z" }] };
    const events = [...diffStores(emptyStore(), s1), ...diffStores(s1, s2)];
    const replayed = replayEvents(events);
    expect(replayed.actions[0].status).toBe("resolved");
    expect(replayed.actions[0].resolved_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("replays outcome_recorded", () => {
    const outcome = {
      id: "out_1", assertion_id: "asr_1", action_id: null,
      description: "confirmed", result: "confirmed" as const,
      calibration_delta: 0.05, created_at: "2026-01-01T00:00:00.000Z",
    };
    const store = { ...emptyStore(), outcomes: [outcome] };
    const replayed = replayEvents(diffStores(emptyStore(), store));
    expect(replayed.outcomes).toHaveLength(1);
    expect(replayed.outcomes[0].result).toBe("confirmed");
  });
});

describe("applyEvent — unknown ids are no-ops", () => {
  it("does not throw when assertion_created is replayed with duplicate id", () => {
    const a = makeAssertion();
    const store = { ...emptyStore(), assertions: [a] };
    expect(() =>
      applyEvent(store, {
        type: "assertion_created",
        ts: new Date().toISOString(),
        payload: a,
      })
    ).not.toThrow();
  });

  it("does not throw when patch_status_changed targets missing id", () => {
    const store = emptyStore();
    expect(() =>
      applyEvent(store, {
        type: "patch_status_changed",
        ts: new Date().toISOString(),
        payload: { id: "missing", from: "pending", to: "approved" },
      })
    ).not.toThrow();
  });

  it("does not throw when action_status_changed targets missing id", () => {
    const store = emptyStore();
    expect(() =>
      applyEvent(store, {
        type: "action_status_changed",
        ts: new Date().toISOString(),
        payload: { id: "missing", from: "open", to: "resolved" },
      })
    ).not.toThrow();
  });
});
