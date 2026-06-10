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

import { commit } from "../commit.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  writtenStore.current = null;
  vi.clearAllMocks();
});

describe("commit", () => {
  it("does nothing when no approved patches", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "pending" })],
    });

    await commit([]);
    expect(writtenStore.current).toBeNull();
  });

  it("applies approved patch to assertion", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion({ confidence: 0.7 })],
      patches: [makePatch({ status: "approved", changes: [{ field: "confidence", from: 0.7, to: 0.85 }] })],
    });
    mockPrompt.mockResolvedValueOnce("");

    await commit([]);

    expect(writtenStore.current!.assertions[0].confidence).toBe(0.85);
  });

  it("marks patch as committed", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "approved" })],
    });
    mockPrompt.mockResolvedValueOnce("");

    await commit([]);

    expect(writtenStore.current!.patches[0].status).toBe("committed");
  });

  it("creates a commit record", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "approved", reason: "new evidence" })],
    });
    mockPrompt.mockResolvedValueOnce("");

    await commit([]);

    const c = writtenStore.current!.commits[0];
    expect(c.id).toMatch(/^cmt_/);
    expect(c.patch_id).toBe("ptch_1");
    expect(c.assertion_id).toBe("asr_1");
    expect(c.snapshot_before.confidence).toBe(0.7);
    expect(c.snapshot_after.confidence).toBe(0.85);
  });

  it("uses prompt input as commit message", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "approved" })],
    });
    mockPrompt.mockResolvedValueOnce("custom message");

    await commit([]);

    expect(writtenStore.current!.commits[0].message).toBe("custom message");
  });

  it("falls back to patch reason when message is blank", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "approved", reason: "patch reason" })],
    });
    mockPrompt.mockResolvedValueOnce("");

    await commit([]);

    expect(writtenStore.current!.commits[0].message).toBe("patch reason");
  });

  it("skips patches whose assertion is missing", async () => {
    mockStore.current = makeStore({
      assertions: [],
      patches: [makePatch({ status: "approved", assertion_id: "asr_missing" })],
    });

    await commit([]);

    expect(writtenStore.current!.commits).toHaveLength(0);
  });
});
