import { readStore, writeStore } from "../db/store.ts";
import { newId, now } from "../db/id.ts";
import { prompt, selectFrom, displayAssertion } from "../ui.ts";
import type { ActionStatus } from "../types.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

const ACTION_TYPE_SUGGESTIONS = ["decision", "experiment", "pass", "publish", "other"];

export async function act(args: string[]) {
  const store = await readStore();
  const json = args.includes("--json");

  // List mode
  if (args.includes("--list")) {
    const open = store.actions.filter((a) => a.status === "open");
    if (json) {
      console.log(JSON.stringify(open.map((a) => ({
        ...a,
        assertion: store.assertions.find((x) => x.id === a.assertion_id),
      })), null, 2));
      return;
    }
    if (open.length === 0) {
      console.log("No open actions.");
      return;
    }
    console.log(`Open actions (${open.length}):\n`);
    for (const a of open) {
      const assertion = store.assertions.find((x) => x.id === a.assertion_id);
      const claim = assertion ? `${assertion.subject} ${assertion.relation} ${assertion.object}` : a.assertion_id;
      console.log(`  ${a.id}`);
      console.log(`  [${a.type}] ${a.description}`);
      console.log(`  assertion: ${claim}`);
      if (Object.keys(a.metadata).length > 0) {
        console.log(`  metadata:  ${JSON.stringify(a.metadata)}`);
      }
      console.log(`  created:   ${a.created_at.slice(0, 10)}`);
      console.log();
    }
    return;
  }

  const active = store.assertions.filter((a) => a.status === "active" || a.status === "revised");
  if (active.length === 0) {
    console.log("No active assertions. Use `reason assert` to add one first.");
    return;
  }

  console.log("Record an action\n");

  // Resolve assertion
  const idArg = flag(args, "--assertion") ?? (args[0] && !args[0].startsWith("--") ? args[0] : undefined);
  let assertion = idArg ? active.find((a) => a.id === idArg) : undefined;
  if (idArg && !assertion) {
    console.error(`No active assertion found with id: ${idArg}`);
    process.exit(1);
  }
  if (!assertion) {
    assertion = await selectFrom(active, (a) => `${a.id}  ${a.subject} ${a.relation} ${a.object} @ ${a.confidence}`, "Which assertion does this action express?");
  } else {
    displayAssertion(assertion);
  }

  // Type — free text with suggestions
  const typeFlag = flag(args, "--type");
  let type: string;
  if (typeFlag) {
    type = typeFlag.trim();
  } else {
    console.log(`\nType suggestions: ${ACTION_TYPE_SUGGESTIONS.join(", ")}`);
    const raw = await prompt("Type (or enter your own): ");
    type = raw.trim() || "other";
  }

  // Description
  const description = flag(args, "--description") ?? await prompt("Description: ");
  if (!description.trim()) {
    console.error("Description is required.");
    process.exit(1);
  }

  // Metadata — accept as --meta key=value pairs or --meta-json '{...}'
  const metadata: Record<string, unknown> = {};
  const metaJson = flag(args, "--meta-json");
  if (metaJson) {
    try {
      Object.assign(metadata, JSON.parse(metaJson));
    } catch {
      console.error("Invalid --meta-json value.");
      process.exit(1);
    }
  }
  // collect any --meta key=value pairs
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "--meta") {
      const pair = args[i + 1];
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        metadata[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
    }
  }

  const action = {
    id: newId("act"),
    assertion_id: assertion.id,
    type,
    description: description.trim(),
    metadata,
    status: "open" as ActionStatus,
    outcome_id: null,
    created_at: now(),
    resolved_at: null,
  };

  store.actions.push(action);
  await writeStore(store);

  console.log(`\nAction recorded: ${action.id}`);
  console.log(`  [${action.type}] ${action.description}`);
  console.log(`  assertion: ${assertion.subject} ${assertion.relation} ${assertion.object} @ ${assertion.confidence}`);
  if (Object.keys(metadata).length > 0) {
    console.log(`  metadata:  ${JSON.stringify(metadata)}`);
  }
  console.log(`\nRun \`reason act --list\` to see open actions.`);
  console.log(`Run \`reason eval ${assertion.id}\` when the action resolves.`);
}
