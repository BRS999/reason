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

  it("auto-resolves all open actions on the assertion", async () => {
    const a = makeAssertion();
    const action1 = makeAction({ id: "act_1", assertion_id: a.id, description: "trade" });
    const action2 = makeAction({ id: "act_2", assertion_id: a.id, description: "publish" });
    mockStore.current = makeStore({ assertions: [a], actions: [action1, action2] });

    await eval_([a.id, "--description", "confirmed", "--result", "c"]);

    for (const act of writtenStore.current!.actions) {
      expect(act.status).toBe("resolved");
      expect(act.outcome_id).toMatch(/^out_/);
      expect(act.resolved_at).not.toBeNull();
    }
  });

  it("does nothing when no active assertions", async () => {
    mockStore.current = makeStore({ assertions: [] });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await eval_([]);

    expect(logs.some((l) => l.includes("No assertions"))).toBe(true);
    expect(writtenStore.current).toBeNull();
  });

  it("exits when no assertion id is provided", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(eval_(["--description", "confirmed", "--result", "c"])).rejects.toThrow("exit");

    exitSpy.mockRestore();
  });

  it("logs auto-resolve message when open action exists", async () => {
    const a = makeAssertion();
    const action = makeAction({ assertion_id: a.id, description: "Short GLD" });
    mockStore.current = makeStore({ assertions: [a], actions: [action] });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await eval_([a.id, "--description", "confirmed", "--result", "c"]);

    expect(logs.some((l) => l.includes("Auto-resolving"))).toBe(true);
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

  it("does not resolve action when assertion has no open actions", async () => {
    const a = makeAssertion();
    const action = makeAction({ assertion_id: a.id, status: "resolved" });
    mockStore.current = makeStore({ assertions: [a], actions: [action] });

    await eval_([a.id, "--description", "confirmed", "--result", "c"]);

    expect(writtenStore.current!.outcomes[0].action_id).toBeNull();
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

  it("exits with already-evaluated message when id is evaluated but other assertions are eligible", async () => {
    const evaluated = makeAssertion({ id: "asr_1", root_id: "asr_1" });
    const eligible = makeAssertion({ id: "asr_2", root_id: "asr_2" });
    const outcome = { id: "out_1", assertion_id: evaluated.id, action_id: null, description: "done", result: "confirmed" as const, calibration_delta: 0.3, created_at: "2026-01-01T00:00:00.000Z" };
    mockStore.current = makeStore({ assertions: [evaluated, eligible], outcomes: [outcome] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s) => errors.push(String(s)));

    await expect(
      eval_([evaluated.id, "--description", "second", "--result", "c"])
    ).rejects.toThrow("exit");

    expect(errors.some((e) => e.includes("already been evaluated"))).toBe(true);
    exitSpy.mockRestore();
  });

  it("exits with generic message when id is not found", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s) => errors.push(String(s)));

    await expect(
      eval_(["asr_unknown", "--description", "desc", "--result", "c"])
    ).rejects.toThrow("exit");

    expect(errors.some((e) => e.includes("No evaluable assertion"))).toBe(true);
    exitSpy.mockRestore();
  });
});
