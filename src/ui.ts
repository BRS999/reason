import type { Assertion } from "./types.ts";

// Line buffer for stdin (works with both TTY and piped input)
let lineBuffer: string[] = [];
let stdinLines: string | null = null;

async function ensureStdinLoaded() {
  if (stdinLines !== null) return;
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    stdinLines = Buffer.concat(chunks).toString("utf8");
    lineBuffer = stdinLines.split("\n");
  }
}

export async function prompt(question: string): Promise<string> {
  process.stdout.write(question);

  if (!process.stdin.isTTY) {
    await ensureStdinLoaded();
    const line = lineBuffer.shift() ?? "";
    process.stdout.write(line + "\n");
    return line;
  }

  // TTY: read one line
  return new Promise((resolve) => {
    let buf = "";
    const onData = (data: Buffer) => {
      const str = data.toString("utf8");
      for (const ch of str) {
        if (ch === "\n" || ch === "\r") {
          process.stdin.off("data", onData);
          process.stdin.pause();
          resolve(buf);
          return;
        }
        buf += ch;
      }
    };
    process.stdin.resume();
    process.stdin.setRawMode?.(false);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
  });
}

export function closeRL() {
  // no-op: stdin is managed per-call
}

export async function selectFrom<T>(items: T[], label: (item: T) => string, heading: string): Promise<T> {
  console.log(`\n${heading}:`);
  items.forEach((item, i) => {
    console.log(`  [${i + 1}] ${label(item)}`);
  });

  while (true) {
    const raw = await prompt(`Select (1-${items.length}): `);
    const n = parseInt(raw.trim());
    if (!isNaN(n) && n >= 1 && n <= items.length) {
      return items[n - 1];
    }
    console.log("Invalid selection, try again.");
  }
}

export function displayAssertion(a: Assertion) {
  console.log(`\n  id:         ${a.id}`);
  console.log(`  claim:      ${a.subject} ${a.relation} ${a.object}`);
  console.log(`  confidence: ${a.confidence}`);
  console.log(`  status:     ${a.status}`);
  console.log(`  evidence:   ${a.evidence || "(none)"}`);
}
