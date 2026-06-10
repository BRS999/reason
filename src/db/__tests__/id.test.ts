import { describe, it, expect } from "vitest";
import { newId, now } from "../id.ts";

describe("newId", () => {
  it("produces correct prefix", () => {
    expect(newId("asr")).toMatch(/^asr_/);
    expect(newId("ptch")).toMatch(/^ptch_/);
    expect(newId("obs")).toMatch(/^obs_/);
  });

  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId("x")));
    expect(ids.size).toBe(100);
  });

  it("includes a UUID after the prefix", () => {
    const id = newId("asr");
    const uuid = id.slice("asr_".length);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("now", () => {
  it("returns a valid ISO string", () => {
    const ts = now();
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});
