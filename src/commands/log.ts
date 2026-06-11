import { readStore } from "../db/store.ts";

export async function log(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");
  const byId = new Map(store.assertions.map(a => [a.id, a]));

  if (store.commits.length === 0) {
    console.log("No commits yet.");
    return;
  }

  if (json) {
    console.log(JSON.stringify(
      [...store.commits].reverse().map((c) => {
        const from = byId.get(c.from_assertion_id);
        const to = byId.get(c.to_assertion_id);
        return {
          id: c.id,
          date: c.created_at,
          message: c.message,
          from_assertion_id: c.from_assertion_id,
          to_assertion_id: c.to_assertion_id,
          claim: from ? `${from.subject} ${from.relation} ${from.object}` : c.from_assertion_id,
          version: to ? `v${to.version}` : undefined,
          changes: store.patches
            .filter(p => p.id === c.patch_id)
            .flatMap(p => p.changes),
        };
      }),
      null, 2
    ));
    return;
  }

  for (const c of [...store.commits].reverse()) {
    const from = byId.get(c.from_assertion_id);
    const to = byId.get(c.to_assertion_id);
    const claim = from ? `${from.subject} ${from.relation} ${from.object}` : c.from_assertion_id;
    const patch = store.patches.find(p => p.id === c.patch_id);

    console.log(`\ncommit ${c.id}`);
    console.log(`Date:    ${c.created_at}`);
    if (from && to) console.log(`Version: v${from.version} → v${to.version}`);
    console.log(`\n    ${c.message}\n`);
    console.log(`    Assertion: ${claim}`);

    if (patch) {
      for (const ch of patch.changes) {
        if (ch.field === "evidence") {
          console.log(`    evidence: [updated]`);
        } else {
          console.log(`    ${ch.field}: ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)}`);
        }
      }
    }
  }
}
