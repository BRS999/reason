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
  displayAssertion: vi.fn(),
}));

import { act } from "../act.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  writtenStore.current = null;
  vi.clearAllMocks();
});

describe("act --list", () => {
  it("prints nothing when no open actions", async () => {
    mockStore.current = makeStore({ actions: [makeAction({ status: "resolved" })] });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(s));

    await act(["--list"]);

    expect(logs.some((l) => l.includes("No open actions"))).toBe(true);
  });

  it("outputs json when --list --json", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({
      assertions: [a],
      actions: [makeAction({ assertion_id: a.id, status: "open" })],
    });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(s));

    await act(["--list", "--json"]);

    const out = JSON.parse(logs.join(""));
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].id).toBe("act_1");
    expect(out[0].assertion.id).toBe("asr_1");
  });

  it("lists open actions", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({
      assertions: [a],
      actions: [makeAction({ assertion_id: a.id, status: "open" })],
    });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(s));

    await act(["--list"]);

    expect(logs.some((l) => l.includes("Short GLD"))).toBe(true);
  });
});

describe("act record", () => {
  it("records an action from flags", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });

    await act([
      "--assertion", a.id,
      "--type", "trade",
      "--description", "Long SPY",
    ]);

    const action = writtenStore.current!.actions[0];
    expect(action.type).toBe("trade");
    expect(action.description).toBe("Long SPY");
    expect(action.assertion_id).toBe(a.id);
    expect(action.status).toBe("open");
    expect(action.id).toMatch(/^act_/);
  });

  it("parses --meta-json metadata", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });

    await act([
      "--assertion", a.id,
      "--type", "trade",
      "--description", "Short GLD",
      "--meta-json", '{"shares":10,"stop":405}',
    ]);

    expect(writtenStore.current!.actions[0].metadata).toEqual({ shares: 10, stop: 405 });
  });

  it("exits on unknown assertion id", async () => {
    mockStore.current = makeStore({ assertions: [makeAssertion()] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(act(["--assertion", "asr_missing", "--type", "trade", "--description", "test"]))
      .rejects.toThrow("exit");

    exitSpy.mockRestore();
  });

  it("does nothing when no active assertions", async () => {
    mockStore.current = makeStore({ assertions: [] });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await act([]);

    expect(logs.some((l) => l.includes("No assertions"))).toBe(true);
    expect(writtenStore.current).toBeNull();
  });

  it("parses --meta key=value pairs", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });

    await act([
      "--assertion", a.id,
      "--type", "experiment",
      "--description", "test run",
      "--meta", "env=staging",
    ]);

    expect(writtenStore.current!.actions[0].metadata).toEqual({ env: "staging" });
  });

  it("uses prompt for type and description when not provided as flags", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    mockPrompt
      .mockResolvedValueOnce("decision")
      .mockResolvedValueOnce("Exit position on stop");

    await act(["--assertion", a.id]);

    const action = writtenStore.current!.actions[0];
    expect(action.type).toBe("decision");
    expect(action.description).toBe("Exit position on stop");
  });

  it("defaults type to 'other' when prompt is blank", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    mockPrompt
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("some action");

    await act(["--assertion", a.id]);

    expect(writtenStore.current!.actions[0].type).toBe("other");
  });

  it("exits with usage error when no id and non-TTY stdin", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s) => errors.push(String(s)));
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    await expect(act([])).rejects.toThrow("exit");
    expect(errors.some((e) => e.includes("assertion ID required"))).toBe(true);

    Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    exitSpy.mockRestore();
  });

  it("displays metadata in --list output", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({
      assertions: [a],
      actions: [makeAction({ assertion_id: a.id, status: "open", metadata: { ticker: "GLD" } })],
    });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await act(["--list"]);

    expect(logs.some((l) => l.includes("ticker"))).toBe(true);
  });

  it("exits when assertion id not found", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s) => errors.push(String(s)));

    await expect(act(["asr_unknown", "--type", "trade", "--description", "test"])).rejects.toThrow("exit");
    expect(errors.some((e) => e.includes("No assertion found"))).toBe(true);
    exitSpy.mockRestore();
  });

  it("exits when description is blank", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    mockPrompt
      .mockResolvedValueOnce("trade")
      .mockResolvedValueOnce("");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(act(["--assertion", a.id])).rejects.toThrow("exit");

    exitSpy.mockRestore();
  });

  it("exits on invalid --meta-json", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({ assertions: [a] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(act([
      "--assertion", a.id,
      "--type", "trade",
      "--description", "test",
      "--meta-json", "not-valid-json",
    ])).rejects.toThrow("exit");

    exitSpy.mockRestore();
  });
});
