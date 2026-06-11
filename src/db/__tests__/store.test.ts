import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";

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

async function runBun(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`bun ${args.join(" ")} failed with code ${code}: ${stderr}`));
      }
    });
  });
}

function readEvents(): Array<{ type: string }> {
  return readFileSync(join(tmpDir, ".reason", "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string });
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
      parent_id: null,
      root_id: "asr_test",
      version: 1,
      subject: "test subject",
      relation: "is",
      object: "true",
      confidence: 0.8,
      evidence: "unit test",
      created_at: new Date().toISOString(),
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
      parent_id: null,
      root_id: "asr_evtest",
      version: 1,
      subject: "events",
      relation: "are",
      object: "appended",
      confidence: 0.9,
      evidence: "test",
      created_at: new Date().toISOString(),
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

  it("preserves parallel writes from separate CLI processes", async () => {
    const { initStore, readStore } = await freshStore();
    await initStore();

    const cliPath = join(originalCwd, "src", "cli.ts");
    const writes = Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      return runBun([
        cliPath,
        "observe",
        "--content",
        `parallel observation ${n}`,
        "--source",
        "parallel-write-test",
      ], tmpDir);
    });

    await Promise.all(writes);

    const store = await readStore();
    const contents = store.observations.map((o) => o.content);
    const events = readFileSync(join(tmpDir, ".reason", "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(store.observations).toHaveLength(20);
    expect(events).toHaveLength(20);
    for (let i = 1; i <= 20; i++) {
      expect(contents).toContain(`parallel observation ${i}`);
    }
  }, 15_000);

  it("preserves mixed parallel create commands", async () => {
    const { initStore, readStore } = await freshStore();
    await initStore();

    const cliPath = join(originalCwd, "src", "cli.ts");
    const writes = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return [
        runBun([
          cliPath,
          "assert",
          "--subject",
          `subject ${n}`,
          "--relation",
          "predicts",
          "--object",
          `object ${n}`,
          "--confidence",
          "0.5",
          "--evidence",
          "parallel-write-test",
        ], tmpDir),
        runBun([
          cliPath,
          "observe",
          "--content",
          `mixed observation ${n}`,
          "--source",
          "parallel-write-test",
        ], tmpDir),
      ];
    }).flat();

    await Promise.all(writes);

    const store = await readStore();
    const events = readEvents();

    expect(store.assertions).toHaveLength(10);
    expect(store.observations).toHaveLength(10);
    expect(events.filter((e) => e.type === "assertion_created")).toHaveLength(10);
    expect(events.filter((e) => e.type === "observation_added")).toHaveLength(10);
  }, 15_000);

  it("does not duplicate stale parallel status transitions", async () => {
    const { initStore, readStore } = await freshStore();
    await initStore();

    const cliPath = join(originalCwd, "src", "cli.ts");
    await runBun([
      cliPath,
      "assert",
      "--subject",
      "base",
      "--relation",
      "predicts",
      "--object",
      "thing",
      "--confidence",
      "0.5",
      "--evidence",
      "parallel-write-test",
    ], tmpDir);

    const assertionId = (await readStore()).assertions[0].id;
    for (let i = 1; i <= 5; i++) {
      await runBun([
        cliPath,
        "patch",
        assertionId,
        "--confidence",
        `0.${i}`,
        "--append-evidence",
        `evidence ${i}`,
        "--reason",
        `reason ${i}`,
      ], tmpDir);
    }

    await Promise.all(Array.from({ length: 5 }, () =>
      runBun([cliPath, "review", "--approve-all"], tmpDir)
    ));

    const store = await readStore();
    const events = readEvents();

    expect(store.patches).toHaveLength(5);
    expect(store.patches.every((p) => p.status === "approved")).toBe(true);
    expect(events.filter((e) => e.type === "patch_status_changed")).toHaveLength(5);
  }, 15_000);

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
