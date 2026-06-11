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

Usage: reason <command> [options]

Build your worldview:
  init                         Initialize a new repository in .reason/
  assert                       Add a new assertion
    --subject <s>              Subject of the claim
    --relation <r>             Relation (predicts, causes, prevents, …)
    --object <o>               Object of the claim
    --confidence <0-1>         Confidence score
    --evidence <text>          Supporting evidence
  observe                      Record a raw observation
    --content <text>           Observation content
    --source <text>            Source (url, document, experiment, …)

Revise and commit:
  patch <id>                   Propose a revision to an assertion
    --confidence <0-1>         New confidence score
    --append-evidence <text>   Append to existing evidence
    --replace-evidence <text>  Replace existing evidence
    --observation <id>         Link to a triggering observation
    --reason <text>            Rationale for the change
  review                       Approve or reject pending patches interactively
    --approve-all              Approve all pending patches
    --approve <id>             Approve a specific patch by id
    --reject-all               Reject all pending patches
    --reject <id>              Reject a specific patch by id
  commit                       Apply approved patches
    --message <text>           Commit message (skips prompt if provided)

Act and evaluate:
  act <id>                     Record an action taken on an assertion
    --type <type>              Type: decision, experiment, publish, pass, …
    --description <text>       What was done
    --meta <key=value>         Attach metadata (repeatable)
    --meta-json <json>         Attach metadata as JSON object
  act --list                   Show all open actions  [--json]
  eval <id>                    Record an outcome against an assertion
    --result <c|r|a>           confirmed, refuted, or ambiguous
    --description <text>       What happened
    --delta <number>           Manual calibration delta (optional)

Inspect:
  status                       Current worldview summary  [--json]
  log                          Full commit history  [--json]
  diff [id]                    Changes in last commit (or specific commit id)
  history <id>                 Full version lineage of an assertion  [--json]
  query <keyword>              Search assertions, observations, commits  [--json] [--explain]
  calibration                  Calibration report across all outcomes  [--json]
  failures                     Assertions with refuted outputs  [--json]

Maintenance:
  migrate                      Upgrade store to latest format (backs up first)
`);
}

main();
