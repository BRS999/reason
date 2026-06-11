import { readStore } from "../db/store.ts";

export async function diff(args: string[]) {
  const store = await readStore();
  const byId = new Map(store.assertions.map(a => [a.id, a]));

  const target = args.length > 0
    ? store.commits.find((c) => c.id === args[0] || c.id.startsWith(args[0]))
    : store.commits[store.commits.length - 1];

  if (!target) {
    console.log(args.length > 0 ? `Commit not found: ${args[0]}` : "No commits yet.");
    return;
  }

  const from = byId.get(target.from_assertion_id);
  const to = byId.get(target.to_assertion_id);
  const patch = store.patches.find(p => p.id === target.patch_id);

  console.log(`diff ${target.id}${args.length === 0 ? " (latest)" : ""}`);
  console.log(`Date:    ${target.created_at}`);
  console.log(`Message: ${target.message}`);
  if (from && to) console.log(`Version: v${from.version} → v${to.version}\n`);

  if (!patch || patch.changes.length === 0) {
    console.log("No field changes recorded.");
    return;
  }

  for (const ch of patch.changes) {
    console.log(`- ${ch.field}: ${JSON.stringify(ch.from)}`);
    console.log(`+ ${ch.field}: ${JSON.stringify(ch.to)}`);
  }
}
