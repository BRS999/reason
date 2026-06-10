import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeStore } from "./helpers.ts";
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

import { observe } from "../observe.ts";

beforeEach(() => {
  mockStore.current = makeStore();
  writtenStore.current = null;
  vi.clearAllMocks();
});

describe("observe", () => {
  it("records an observation from flags", async () => {
    await observe(["--content", "CPI came in at 2.9%", "--source", "BLS release"]);

    const obs = writtenStore.current!.observations[0];
    expect(obs.content).toBe("CPI came in at 2.9%");
    expect(obs.source).toBe("BLS release");
    expect(obs.id).toMatch(/^obs_/);
  });

  it("trims whitespace", async () => {
    await observe(["--content", "  market data  ", "--source", "  bloomberg  "]);

    const obs = writtenStore.current!.observations[0];
    expect(obs.content).toBe("market data");
    expect(obs.source).toBe("bloomberg");
  });

  it("falls back to prompt when flags are missing", async () => {
    const { prompt } = await import("../../ui.ts");
    vi.mocked(prompt)
      .mockResolvedValueOnce("jobless claims fell")
      .mockResolvedValueOnce("DOL weekly report");

    await observe([]);

    const obs = writtenStore.current!.observations[0];
    expect(obs.content).toBe("jobless claims fell");
    expect(obs.source).toBe("DOL weekly report");
  });

  it("appends without overwriting existing observations", async () => {
    mockStore.current = makeStore({
      observations: [{ id: "obs_existing", content: "old", source: "old", created_at: "2026-01-01T00:00:00.000Z" }],
    });

    await observe(["--content", "new signal", "--source", "reuters"]);

    expect(writtenStore.current!.observations).toHaveLength(2);
  });
});
