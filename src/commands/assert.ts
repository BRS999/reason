import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt } from "../ui.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

export async function assert_(args: string[]) {
  const store = await readStore();

  console.log("New assertion\n");
  const subject = flag(args, "--subject") ?? await prompt("Subject: ");
  const relation = flag(args, "--relation") ?? await prompt("Relation (predicts, causes, prevents, correlates, etc.): ");
  const object = flag(args, "--object") ?? await prompt("Object: ");
  const confidenceRaw = flag(args, "--confidence") ?? await prompt("Confidence (0.0 – 1.0): ");
  const evidence = flag(args, "--evidence") ?? await prompt("Evidence summary: ");

  const confidence = parseFloat(confidenceRaw);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    console.error("Confidence must be a number between 0 and 1.");
    process.exit(1);
  }

  const assertion = {
    id: newId("asr"),
    subject: subject.trim(),
    relation: relation.trim(),
    object: object.trim(),
    confidence,
    evidence: evidence.trim(),
    status: "active" as const,
    created_at: now(),
    updated_at: now(),
  };

  store.assertions.push(assertion);
  await writeStore(store);

  console.log(`\nAssertion created: ${assertion.id}`);
  console.log(`  "${assertion.subject} ${assertion.relation} ${assertion.object}" @ ${confidence}`);
}
