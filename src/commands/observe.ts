import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt } from "../ui.ts";

export async function observe(args: string[]) {
  const store = await readStore();

  const flagContent = getFlagValue(args, "--content");
  const flagSource = getFlagValue(args, "--source");
  const positional = args.filter((a) => !a.startsWith("--") && !isPrevFlag(args, a)).join(" ");

  const content = flagContent ?? (positional || await prompt("Observation: "));
  const source = flagSource ?? await prompt("Source (url, document, experiment, etc.): ");

  const obs = {
    id: newId("obs"),
    content: content.trim(),
    source: source.trim(),
    created_at: now(),
  };

  store.observations.push(obs);
  await writeStore(store);

  console.log(`\nObservation recorded: ${obs.id}`);
  console.log(`  "${obs.content}"`);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

function isPrevFlag(args: string[], val: string): boolean {
  const i = args.indexOf(val);
  return i > 0 && args[i - 1].startsWith("--");
}
