import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeStore, makeAssertion, makePatch, makeAction, makeOutcome } from "./helpers.ts";

const mockStore = { current: makeStore() };

vi.mock("../../db/store.ts", () => ({
  readStore: async () => structuredClone(mockStore.current),
  writeStore: vi.fn(),
}));

import { status } from "../status.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  vi.clearAllMocks();
});

describe("status --json", () => {
  it("returns correct counts for empty store", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(s));

    await status(["--json"]);

    const out = JSON.parse(lines.join(""));
    expect(out.assertions.active).toBe(0);
    expect(out.observations).toBe(0);
    expect(out.patches.pending).toBe(0);
    expect(out.commits).toBe(0);
    expect(out.actions.open).toBe(0);
  });

  it("counts assertions by status", async () => {
    mockStore.current = makeStore({
      assertions: [
        makeAssertion({ id: "a1", status: "active" }),
        makeAssertion({ id: "a2", status: "revised" }),
        makeAssertion({ id: "a3", status: "invalidated" }),
      ],
    });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(s));

    await status(["--json"]);

    const out = JSON.parse(lines.join(""));
    expect(out.assertions.active).toBe(1);
    expect(out.assertions.revised).toBe(1);
    expect(out.assertions.invalidated).toBe(1);
  });

  it("counts patches by status", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [
        makePatch({ id: "p1", status: "pending" }),
        makePatch({ id: "p2", status: "approved" }),
        makePatch({ id: "p3", status: "committed" }),
      ],
    });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(s));

    await status(["--json"]);

    const out = JSON.parse(lines.join(""));
    expect(out.patches.pending).toBe(1);
    expect(out.patches.approved).toBe(1);
  });

  it("counts open actions", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      actions: [
        makeAction({ id: "act_1", status: "open" }),
        makeAction({ id: "act_2", status: "resolved" }),
      ],
    });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(s));

    await status(["--json"]);

    const out = JSON.parse(lines.join(""));
    expect(out.actions.open).toBe(1);
    expect(out.actions.total).toBe(2);
  });

  it("includes calibration avg_delta when outcomes exist", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      outcomes: [
        makeOutcome({ id: "o1", calibration_delta: 0.3 }),
        makeOutcome({ id: "o2", calibration_delta: -0.1 }),
      ],
    });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(s));

    await status(["--json"]);

    const out = JSON.parse(lines.join(""));
    expect(out.calibration.avg_delta).toBe(0.1);
  });

  it("includes active assertions sorted by confidence descending", async () => {
    mockStore.current = makeStore({
      assertions: [
        makeAssertion({ id: "a1", confidence: 0.5 }),
        makeAssertion({ id: "a2", confidence: 0.9 }),
        makeAssertion({ id: "a3", confidence: 0.7 }),
      ],
    });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(s));

    await status(["--json"]);

    const out = JSON.parse(lines.join(""));
    const confidences = out.active_assertions.map((a: { confidence: number }) => a.confidence);
    expect(confidences).toEqual([0.9, 0.7, 0.5]);
  });
});

describe("status text output", () => {
  function capture() {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s) => lines.push(String(s)));
    return lines;
  }

  it("prints header counts", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion({ status: "active" })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("1 active"))).toBe(true);
  });

  it("prints active assertions sorted by confidence", async () => {
    mockStore.current = makeStore({
      assertions: [
        makeAssertion({ id: "a1", confidence: 0.9, subject: "gold", relation: "will", object: "fall" }),
        makeAssertion({ id: "a2", confidence: 0.5, subject: "fed", relation: "will", object: "hold" }),
      ],
    });
    const lines = capture();
    await status([]);
    const assertionLines = lines.filter((l) => l.includes("%"));
    expect(assertionLines[0]).toContain("90%");
    expect(assertionLines[1]).toContain("50%");
  });

  it("prints open actions", async () => {
    const a = makeAssertion();
    mockStore.current = makeStore({
      assertions: [a],
      actions: [makeAction({ assertion_id: a.id, type: "trade", description: "Short GLD" })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("[trade]") && l.includes("Short GLD"))).toBe(true);
  });

  it("prints pending patch reminder", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "pending" })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("pending patch"))).toBe(true);
  });

  it("prints approved patch reminder", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      patches: [makePatch({ status: "approved" })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("approved patch"))).toBe(true);
  });

  it("prints calibration when outcomes exist", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      outcomes: [makeOutcome({ calibration_delta: -0.3 })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("overconfident"))).toBe(true);
  });

  it("prints underconfident calibration label", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      outcomes: [makeOutcome({ calibration_delta: 0.3 })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("underconfident"))).toBe(true);
  });

  it("prints well-calibrated label for small delta", async () => {
    mockStore.current = makeStore({
      assertions: [makeAssertion()],
      outcomes: [makeOutcome({ calibration_delta: 0.05 })],
    });
    const lines = capture();
    await status([]);
    expect(lines.some((l) => l.includes("well-calibrated"))).toBe(true);
  });
});
