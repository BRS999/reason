import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeStore, makeAssertion } from "./helpers.ts";
import type { Store } from "../../db/store.ts";

const mockStore = { current: makeStore() };
const writtenStore = { current: null as Store | null };

vi.mock("../../db/store.ts", () => ({
  readStore: async () => structuredClone(mockStore.current),
  writeStore: async (s: Store) => { writtenStore.current = s; },
}));

vi.mock("../../ui.ts", () => ({
  prompt: vi.fn(),
}));

import { assert_ } from "../assert.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  writtenStore.current = null;
  vi.clearAllMocks();
});

describe("assert_", () => {
  it("creates an assertion from flags", async () => {
    await assert_([
      "--subject", "Fed policy",
      "--relation", "will",
      "--object", "hold rates",
      "--confidence", "0.75",
      "--evidence", "dot plot unchanged",
    ]);

    const a = writtenStore.current!.assertions[0];
    expect(a.subject).toBe("Fed policy");
    expect(a.relation).toBe("will");
    expect(a.object).toBe("hold rates");
    expect(a.confidence).toBe(0.75);
    expect(a.evidence).toBe("dot plot unchanged");
    expect(a.status).toBe("active");
    expect(a.id).toMatch(/^asr_/);
  });

  it("trims whitespace from fields", async () => {
    await assert_([
      "--subject", "  inflation  ",
      "--relation", "is",
      "--object", "  decelerating  ",
      "--confidence", "0.6",
      "--evidence", "  CPI data  ",
    ]);

    const a = writtenStore.current!.assertions[0];
    expect(a.subject).toBe("inflation");
    expect(a.object).toBe("decelerating");
    expect(a.evidence).toBe("CPI data");
  });

  it("appends to existing assertions", async () => {
    mockStore.current = makeStore({ assertions: [makeAssertion()] });

    await assert_([
      "--subject", "gold",
      "--relation", "will",
      "--object", "decline",
      "--confidence", "0.65",
      "--evidence", "real yields rising",
    ]);

    expect(writtenStore.current!.assertions).toHaveLength(2);
  });

  it("falls back to prompt when flags are missing", async () => {
    const { prompt } = await import("../../ui.ts");
    vi.mocked(prompt)
      .mockResolvedValueOnce("rates")
      .mockResolvedValueOnce("will")
      .mockResolvedValueOnce("rise")
      .mockResolvedValueOnce("0.8")
      .mockResolvedValueOnce("hawkish Fed speakers");

    await assert_([]);

    const a = writtenStore.current!.assertions[0];
    expect(a.subject).toBe("rates");
    expect(a.confidence).toBe(0.8);
  });

  it("exits on invalid confidence", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await expect(assert_([
      "--subject", "x", "--relation", "y", "--object", "z",
      "--confidence", "1.5",
      "--evidence", "e",
    ])).rejects.toThrow("exit");

    exitSpy.mockRestore();
  });
});
