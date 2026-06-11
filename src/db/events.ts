import type {
  Assertion, Observation, EpistemicPatch, PatchStatus,
  Commit, Action, ActionStatus, Outcome,
} from "../types.ts";
import type { Store } from "./store.ts";
import { now } from "./id.ts";

// ---------------------------------------------------------------------------
// Event schema
// ---------------------------------------------------------------------------

export type StoreEvent =
  | { type: "assertion_created";     ts: string; payload: Assertion }
  | { type: "observation_added";     ts: string; payload: Observation }
  | { type: "patch_proposed";        ts: string; payload: EpistemicPatch }
  | { type: "patch_status_changed";  ts: string; payload: { id: string; from: PatchStatus; to: PatchStatus } }
  | { type: "commit_created";        ts: string; payload: Commit }
  | { type: "action_opened";         ts: string; payload: Action }
  | { type: "action_status_changed"; ts: string; payload: { id: string; from: ActionStatus; to: ActionStatus; outcome_id?: string | null; resolved_at?: string | null } }
  | { type: "outcome_recorded";      ts: string; payload: Outcome };

// ---------------------------------------------------------------------------
// Diff — produces events describing what changed between two store snapshots
// ---------------------------------------------------------------------------

export function diffStores(before: Store, after: Store): StoreEvent[] {
  const events: StoreEvent[] = [];
  const t = now();

  // Assertions are immutable — only ever created, never updated
  const beforeAssertionIds = new Set(before.assertions.map(a => a.id));
  for (const a of after.assertions) {
    if (!beforeAssertionIds.has(a.id)) {
      events.push({ type: "assertion_created", ts: t, payload: a });
    }
  }

  // Observations
  const beforeObsIds = new Set(before.observations.map(o => o.id));
  for (const o of after.observations) {
    if (!beforeObsIds.has(o.id)) {
      events.push({ type: "observation_added", ts: t, payload: o });
    }
  }

  // Patches
  const beforePatches = new Map(before.patches.map(p => [p.id, p]));
  for (const p of after.patches) {
    const old = beforePatches.get(p.id);
    if (!old) {
      events.push({ type: "patch_proposed", ts: t, payload: p });
    } else if (old.status !== p.status) {
      events.push({ type: "patch_status_changed", ts: t, payload: { id: p.id, from: old.status, to: p.status } });
    }
  }

  // Commits
  const beforeCommitIds = new Set(before.commits.map(c => c.id));
  for (const c of after.commits) {
    if (!beforeCommitIds.has(c.id)) {
      events.push({ type: "commit_created", ts: t, payload: c });
    }
  }

  // Actions
  const beforeActions = new Map(before.actions.map(a => [a.id, a]));
  for (const a of after.actions) {
    const old = beforeActions.get(a.id);
    if (!old) {
      events.push({ type: "action_opened", ts: t, payload: a });
    } else if (old.status !== a.status) {
      events.push({
        type: "action_status_changed", ts: t,
        payload: { id: a.id, from: old.status, to: a.status, outcome_id: a.outcome_id, resolved_at: a.resolved_at },
      });
    }
  }

  // Outcomes
  const beforeOutcomeIds = new Set(before.outcomes.map(o => o.id));
  for (const o of after.outcomes) {
    if (!beforeOutcomeIds.has(o.id)) {
      events.push({ type: "outcome_recorded", ts: t, payload: o });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Replay — rebuild a Store by replaying all events from scratch
// ---------------------------------------------------------------------------

export function replayEvents(events: StoreEvent[]): Store {
  const store: Store = {
    assertions: [], observations: [], patches: [],
    commits: [], outcomes: [], actions: [],
  };

  for (const event of events) {
    applyEvent(store, event);
  }

  return store;
}

export function applyEvent(store: Store, event: StoreEvent): void {
  switch (event.type) {
    case "assertion_created":
      store.assertions.push(event.payload);
      break;
    case "observation_added":
      store.observations.push(event.payload);
      break;
    case "patch_proposed":
      store.patches.push(event.payload);
      break;
    case "patch_status_changed": {
      const p = store.patches.find(p => p.id === event.payload.id);
      if (p) p.status = event.payload.to;
      break;
    }
    case "commit_created":
      store.commits.push(event.payload);
      break;
    case "action_opened":
      store.actions.push(event.payload);
      break;
    case "action_status_changed": {
      const a = store.actions.find(a => a.id === event.payload.id);
      if (a) {
        a.status = event.payload.to;
        if (event.payload.outcome_id !== undefined) a.outcome_id = event.payload.outcome_id;
        if (event.payload.resolved_at !== undefined) a.resolved_at = event.payload.resolved_at;
      }
      break;
    }
    case "outcome_recorded":
      store.outcomes.push(event.payload);
      break;
  }
}
