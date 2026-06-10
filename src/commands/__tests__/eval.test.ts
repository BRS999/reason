import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeStore, makeAssertion, makeAction } from "./helpers.ts";
import type { Store } from "../../db/store.ts";

const mockStore = { current: makeStore() };
const writtenStore = { current: null as Store | null };
const mockPrompt = vi.fn();
const mockSelectFrom = vi.fn();

vi.mock("../../db/store.ts", () => ({
  readStore: async () => structuredClone(mockStore.current),
  writeStore: async (s: Store) => { writtenStore.current = s; },
}));

vi.mock("../../ui.ts", () => ({
  prompt: (...args: unknown[]) => mockPrompt(...args),
  selectFrom: (...args: unknown[]) => mockSelectFrom(...args),
}));

import { eval_ } from "../eval.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  writtenStore.current = null;
  vi.clearAllMocks();
});

describe("eval_", () => {
  it("records a confirmed outcome from flags", async () => {
    const a = makeAssertion({ confidence: 0.7 });
    mockStore.current = makeStore({ assertions: [a] });

    await eval_([a.id, "--description", "CPI confirmed trend", "--result", "c"]);

    const outcome = writtenStore.current!.outcomes[0];
    expect(outcome.result).toBe("confirmed");
    expect(outcome.assertion_id).toBe(a.id);
    expect(outcome.description).toBe("CPI confirmed trend");
  });

  it("records a refuted outcome", async () => {
    const a = makeAssertion({ confidence: 0.7 });
    mockStore.current = makeStore({ assertions: [a] });

    await eval_([a.id, "--description", "CPI beat consensus", "--result", "r"]);

    expect(writtenStore.current!.outcomes[0].result).toBe("refuted");
  });

  it("calculates calibration_delta correctly", async () => {
    const a = makeAssertion({ confidence: 0.7 });
    mockStore.current = makeStore({ assertions: [a] });

    // confirmed → actual 1.0, delta = 1.0 - 0.7 = 0.3
    await eval_([a.id, "--description", "confirmed", "--result", "c"]);
    expect(writtenStore.current!.outcomes[0].calibration_delta).toBe(0.3);
  });

  it("calculates calibration_delta for refuted", async () => {
    const a = makeAssertion({ confidence: 0.8 });
    mockStore.current = makeStore({ assertions: [a] });

    // refuted → actual 0.0, delta = 0.0 - 0.8 = -0.8
    await eval_([a.id, "--description", "refuted", "--result", "r"]);
    expect(writtenStore.current!.outcomes[0].calibration_delta).toBe(-0.8);
  });

  it("calculates calibration_delta for ambiguous", async () => {
    const a = makeAssertion({ confidence: 0.6 });
    mockStore.current = makeStore({ assertions: [a] });

    // ambiguous → actual 0.5, delta = 0.5 - 0.6 = -0.1
    await eval_([a.id, "--description", "ambiguous", "--result", "a"]);
    expect(writtenStore.current!.outcomes[0].calibration_delta).toBe(-0.1);
  });

  it("resolves linked open action", async () => {
    const a = makeAssertion();
    const action = makeAction({ assertion_id: a.id });
    mockStore.current = makeStore({ assertions: [a], actions: [action] });

    // prompt: link action? y, then selectFrom returns action
    mockPrompt.mockResolvedValueOnce("y");
    mockSelectFrom.mockResolvedValueOnce(action);

    await eval_([a.id, "--description", "confirmed", "--result", "c"]);

    const resolvedAction = writtenStore.current!.actions[0];
    expect(resolvedAction.status).toBe("resolved");
    expect(resolvedAction.outcome_id).toMatch(/^out_/);
    expect(resolvedAction.resolved_at).not.toBeNull();
  });

  it("does nothing when no active assertions", async () => {
    mockStore.current = makeStore({ assertions: [] });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await eval_([]);

    expect(logs.some((l) => l.includes("No active assertions"))).toBe(true);
    expect(writtenStore.current).toBeNull();
  });

  it("uses interactive selector when no id arg", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    mockSelectFrom.mockResolvedValueOnce(a);

    await eval_(["--description", "confirmed", "--result", "c"]);

    expect(writtenStore.current!.outcomes[0].assertion_id).toBe(a.id);
  });

  it("displays action metadata in the open-actions block", async () => {
    const a = makeAssertion();
    const action = makeAction({ assertion_id: a.id, metadata: { shares: 10, stop: 405 } });
    mockStore.current = makeStore({ assertions: [a], actions: [action] });
    mockPrompt.mockResolvedValueOnce("n");
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await eval_([a.id, "--description", "confirmed", "--result", "c"]);

    expect(logs.some((l) => l.includes("shares"))).toBe(true);
  });

  it("uses prompt for description and result when flags are absent", async () => {
    const a = makeAssertion({ confidence: 0.7 });
    mockStore.current = makeStore({ assertions: [a] });
    mockPrompt
      .mockResolvedValueOnce("trend continued")
      .mockResolvedValueOnce("c");

    await eval_([a.id]);

    const outcome = writtenStore.current!.outcomes[0];
    expect(outcome.description).toBe("trend continued");
    expect(outcome.result).toBe("confirmed");
  });

  it("does not resolve action when user declines", async () => {
    const a = makeAssertion();
    const action = makeAction({ assertion_id: a.id });
    mockStore.current = makeStore({ assertions: [a], actions: [action] });
    mockPrompt.mockResolvedValueOnce("n");

    await eval_([a.id, "--description", "confirmed", "--result", "c"]);

    expect(writtenStore.current!.actions[0].status).toBe("open");
  });

  it("exits on invalid result code", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(
      eval_([a.id, "--description", "desc", "--result", "x"])
    ).rejects.toThrow("exit");

    exitSpy.mockRestore();
  });
});
