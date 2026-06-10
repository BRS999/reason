import { readStore } from "../db/store.ts";
import type { Assertion } from "../types.ts";

function diffAssertions(before: Assertion, after: Assertion): string[] {
  const lines: string[] = [];
  const fields = ["subject", "relation", "object", "confidence", "status", "evidence"] as const;
  for (const f of fields) {
    const b = before[f];
    const a = after[f];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      lines.push(`- ${f}: ${JSON.stringify(b)}`);
      lines.push(`+ ${f}: ${JSON.stringify(a)}`);
    }
  }
  return lines;
}

export async function diff(args: string[]) {
  const store = await readStore();

  if (args.length > 0) {
    // diff <commit_id>
    const target = store.commits.find((c) => c.id === args[0] || c.id.startsWith(args[0]));
    if (!target) {
      console.error(`Commit not found: ${args[0]}`);
      process.exit(1);
    }
    console.log(`diff ${target.id}`);
    console.log(`Date: ${target.created_at}`);
    console.log(`Message: ${target.message}\n`);
    const lines = diffAssertions(target.snapshot_before, target.snapshot_after);
    console.log(lines.join("\n"));
    return;
  }

  // Default: show diff of last commit
  if (store.commits.length === 0) {
    console.log("No commits yet.");
    return;
  }

  const last = store.commits[store.commits.length - 1];
  console.log(`diff ${last.id} (latest commit)\n`);
  const lines = diffAssertions(last.snapshot_before, last.snapshot_after);
  if (lines.length === 0) {
    console.log("No changes.");
  } else {
    console.log(lines.join("\n"));
  }
}
