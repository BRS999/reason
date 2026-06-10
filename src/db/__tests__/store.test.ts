import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// store.ts holds module-level _lastSnapshot state, so we reset modules between
// tests and re-import fresh to avoid cross-test contamination.

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), "reason-test-"));
  process.chdir(tmpDir);
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

async function freshStore() {
  return import("../store.ts");
}

describe("initStore", () => {
  it("creates events.jsonl and snapshot.json", async () => {
    const { initStore } = await freshStore();
    await initStore();
    const { existsSync } = await import("fs");
    expect(existsSync(join(tmpDir, ".reason", "events.jsonl"))).toBe(true);
    expect(existsSync(join(tmpDir, ".reason", "snapshot.json"))).toBe(true);
  });

  it("throws if already initialized", async () => {
    const { initStore } = await freshStore();
    await initStore();
    await expect(initStore()).rejects.toThrow("already initialized");
  });
});

describe("readStore / writeStore", () => {
  it("round-trips an empty store", async () => {
    const { initStore, readStore, writeStore } = await freshStore();
    await initStore();
    const store = await readStore();
    expect(store.assertions).toHaveLength(0);
    await writeStore(store);
    const store2 = await readStore();
    expect(store2.assertions).toHaveLength(0);
  });

  it("persists a written assertion", async () => {
    const { initStore, readStore, writeStore } = await freshStore();
    await initStore();
    const store = await readStore();
    store.assertions.push({
      id: "asr_test",
      subject: "test subject",
      relation: "is",
      object: "true",
      confidence: 0.8,
      evidence: "unit test",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await writeStore(store);

    vi.resetModules();
    const { readStore: readStore2 } = await import("../store.ts");
    const store2 = await readStore2();
    expect(store2.assertions).toHaveLength(1);
    expect(store2.assertions[0].id).toBe("asr_test");
  });

  it("appends events to events.jsonl on write", async () => {
    const { initStore, readStore, writeStore } = await freshStore();
    await initStore();
    const store = await readStore();
    store.assertions.push({
      id: "asr_evtest",
      subject: "events",
      relation: "are",
      object: "appended",
      confidence: 0.9,
      evidence: "test",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await writeStore(store);

    const { readFileSync } = await import("fs");
    const lines = readFileSync(join(tmpDir, ".reason", "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const event = JSON.parse(lines[lines.length - 1]);
    expect(event.type).toBe("assertion_created");
    expect(event.payload.id).toBe("asr_evtest");
  });

  it("throws when no repository exists", async () => {
    const { readStore } = await freshStore();
    await expect(readStore()).rejects.toThrow("reason init" );
  });
});

describe("isInitialized", () => {
  it("returns false before init", async () => {
    const { isInitialized } = await freshStore();
    expect(isInitialized()).toBe(false);
  });

  it("returns true after init", async () => {
    const { initStore, isInitialized } = await freshStore();
    await initStore();
    expect(isInitialized()).toBe(true);
  });
});
