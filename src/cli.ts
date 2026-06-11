#!/usr/bin/env bun

import { closeRL } from "./ui.ts";
import { init } from "./commands/init.ts";
import { observe } from "./commands/observe.ts";
import { assert_ } from "./commands/assert.ts";
import { patch } from "./commands/patch.ts";
import { review } from "./commands/review.ts";
import { commit } from "./commands/commit.ts";
import { log } from "./commands/log.ts";
import { diff } from "./commands/diff.ts";
import { query } from "./commands/query.ts";
import { eval_ } from "./commands/eval.ts";
import { status } from "./commands/status.ts";
import { calibration } from "./commands/calibration.ts";
import { failures } from "./commands/failures.ts";
import { act } from "./commands/act.ts";
import { history } from "./commands/history.ts";
import { migrate } from "./commands/migrate.ts";

const [, , cmd, ...args] = process.argv;

const commands: Record<string, (args: string[]) => Promise<void>> = {
  init,
  observe,
  assert: assert_,
  patch,
  review,
  commit,
  log,
  diff,
  query,
  eval: eval_,
  status,
  calibration,
  failures,
  act,
  history,
  migrate,
};

async function main() {
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  const handler = commands[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
  }

  try {
    await handler(args);
    closeRL();
  } catch (err) {
    closeRL();
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

function printHelp() {
  console.log(`reason — reasoning repository

Usage: reason <command> [args]

Commands:
  init        Initialize a new repository in .reason/
  assert      Add a new assertion to the worldview
  observe     Record a new observation
  patch       Propose a change to an assertion
  review      Approve or reject pending patches
  commit      Apply approved patches to the worldview
  log         Show commit history
  diff [id]   Show what changed in last commit (or specific commit)
  query <kw>  Search assertions, commits, and observations  [--json]
  eval [id]   Record an outcome and evaluate calibration
  status      Show current worldview summary               [--json]
  calibration Show calibration report across all outcomes  [--json]
  failures    Show repeatedly refuted assertions           [--json]
  act [id]    Record an action taken on an assertion       [--list]
  history <id> Show full lineage of an assertion            [--json]
  migrate     Upgrade store format to latest version
`);
}

main();
