export type AssertionStatus = "active" | "revised" | "invalidated" | "archived";

export interface Assertion {
  id: string;
  subject: string;
  relation: string;
  object: string;
  confidence: number; // 0.0 - 1.0
  evidence: string;   // free-text summary
  status: AssertionStatus;
  created_at: string;
  updated_at: string;
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
  changes: PatchChange[]; // JSON array
  reason: string;
  status: PatchStatus;
  created_at: string;
}

export interface Commit {
  id: string;
  patch_id: string;
  assertion_id: string;
  snapshot_before: Assertion; // full assertion snapshot
  snapshot_after: Assertion;
  message: string;
  created_at: string;
}

export interface Outcome {
  id: string;
  assertion_id: string;
  action_id: string | null;
  description: string;
  result: "confirmed" | "refuted" | "ambiguous";
  calibration_delta: number; // how far off was confidence? negative = overconfident
  created_at: string;
}

export type ActionStatus = "open" | "resolved" | "cancelled";

export interface Action {
  id: string;
  assertion_id: string;
  type: string;                      // free text — e.g. "decision", "experiment", "pass", "publish"
  description: string;
  metadata: Record<string, unknown>; // flexible key/value context
  status: ActionStatus;
  outcome_id: string | null;         // set when resolved via eval
  created_at: string;
  resolved_at: string | null;
}
