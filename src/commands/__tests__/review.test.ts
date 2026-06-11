import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeStore, makeAssertion, makePatch } from "./helpers.ts";
import type { Store } from "../../db/store.ts";

const mockStore = { current: makeStore() };
const writtenStore = { current: null as Store | null };
const mockPrompt = vi.fn();

vi.mock("../../db/store.ts", () => ({
  readStore: async () => structuredClone(mockStore.current),
  writeStore: async (s: Store) => { writtenStore.current = s; },
}));

vi.mock("../../ui.ts", () => ({
  prompt: (...args: unknown[]) => mockPrompt(...args),
}));

import { review } from "../review.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  writtenStore.current = null;
  vi.clearAllMocks();
});

describe("review --approve-all", () => {
  it("approves all pending patches", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch(), makePatch({ id: "ptch_2" })],
    });

    await review(["--approve-all"]);

    const statuses = writtenStore.current!.patches.map((p) => p.status);
    expect(statuses).toEqual(["approved", "approved"]);
  });

  it("does nothing when no pending patches", async () => {
    mockStore.current = makeStore({
      patches: [makePatch({ status: "committed" })],
    });

    await review(["--approve-all"]);
    expect(writtenStore.current).toBeNull();
  });
});

describe("review --reject-all", () => {
  it("rejects all pending patches", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch(), makePatch({ id: "ptch_2" })],
    });

    await review(["--reject-all"]);

    const statuses = writtenStore.current!.patches.map((p) => p.status);
    expect(statuses).toEqual(["rejected", "rejected"]);
  });
});

describe("review --approve <id>", () => {
  it("approves a specific pending patch by id", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ id: "ptch_target" }), makePatch({ id: "ptch_other" })],
    });

    await review(["--approve", "ptch_target"]);

    const statuses = writtenStore.current!.patches.map((p) => p.status);
    expect(statuses).toEqual(["approved", "pending"]);
  });

  it("exits with error when patch id not found or not pending", async () => {
    mockStore.current = makeStore({ patches: [makePatch({ id: "ptch_1", status: "committed" })] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(review(["--approve", "ptch_nope"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("review --reject <id>", () => {
  it("rejects a specific pending patch by id", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ id: "ptch_target" }), makePatch({ id: "ptch_other" })],
    });

    await review(["--reject", "ptch_target"]);

    const statuses = writtenStore.current!.patches.map((p) => p.status);
    expect(statuses).toEqual(["rejected", "pending"]);
  });

  it("exits with error when patch id not found or not pending", async () => {
    mockStore.current = makeStore({ patches: [] });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(review(["--reject", "ptch_nope"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("review interactive", () => {
  it("approves on 'a'", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch()],
    });
    mockPrompt.mockResolvedValueOnce("a");

    await review([]);

    expect(writtenStore.current!.patches[0].status).toBe("approved");
  });

  it("rejects on 'r'", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch()],
    });
    mockPrompt.mockResolvedValueOnce("r");

    await review([]);

    expect(writtenStore.current!.patches[0].status).toBe("rejected");
  });

  it("displays linked observation content", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      observations: [{ id: "obs_1", content: "CPI came in at 2.9%", source: "BLS", created_at: "2026-01-01T00:00:00.000Z" }],
      patches: [makePatch({ observation_id: "obs_1" })],
    });
    mockPrompt.mockResolvedValueOnce("s");
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => logs.push(String(s)));

    await review([]);

    expect(logs.some((l) => l.includes("CPI came in at 2.9%"))).toBe(true);
  });

  it("leaves pending on skip", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch()],
    });
    mockPrompt.mockResolvedValueOnce("s");

    await review([]);

    expect(writtenStore.current!.patches[0].status).toBe("pending");
  });
});
