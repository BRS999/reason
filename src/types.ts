export interface Assertion {
  id: string;
  parent_id: string | null;
  root_id: string;
  version: number;

  subject: string;
  relation: string;
  object: string;
  confidence: number; // 0.0 - 1.0
  evidence: string;

  created_at: string;
}

export interface Observation {
  id: string;
  content: string;
  source: string;
  created_at: string;
}

export type PatchStatus = "pending" | "approved" | "rejected" | "committed";

export interface PatchChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface EpistemicPatch {
  id: string;
  assertion_id: string;
  observation_id: string | null;
  changes: PatchChange[];
  reason: string;
  status: PatchStatus;
  created_at: string;
}

export interface Commit {
  id: string;
  patch_id: string;
  from_assertion_id: string;
  to_assertion_id: string;
  message: string;
  created_at: string;
}

export interface Outcome {
  id: string;
  assertion_id: string;
  action_id: string | null;
  description: string;
  result: "confirmed" | "refuted" | "ambiguous";
  calibration_delta: number;
  created_at: string;
}

export type ActionStatus = "open" | "resolved" | "cancelled";

export interface Action {
  id: string;
  assertion_id: string;
  type: string;
  description: string;
  metadata: Record<string, unknown>;
  status: ActionStatus;
  outcome_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

// Derived state — computed from the graph, never stored
export type AssertionState = "current" | "under_test" | "evaluated" | "superseded";
