<img src="icon.svg" width="64" height="64" alt="reason" />

# reason

**A version-controlled assertion store for AI agents and the humans who work with them.**

Most AI systems act on what they know right now. `reason` is infrastructure for what they assert over time — a persistent, inspectable repository where assertions are first-class objects with history, evidence, confidence, and calibration.

---

## Why this exists

AI agents have a context window, not a worldview. Every session starts cold. Observations get made, decisions get taken, and then everything evaporates — there's no record of what was asserted, why, or whether it turned out to be right.

`reason` solves that. It gives agents (and the humans working alongside them) a shared, durable store of structured assertions that:

- **Accumulate over time** — observations and revisions build up rather than disappear
- **Are traceable** — every assertion has evidence; every change has a reason
- **Are falsifiable** — outcomes are recorded and confidence is measured against reality
- **Are inspectable** — any agent or human can query the worldview and understand not just what is asserted, but why

The result is a reasoning loop that gets better with use: agents learn what they're calibrated on, where they're overconfident, and which kinds of evidence reliably move their assertions in the right direction.

---

## Architecture

```
Observations ──► Patches ──► Review ──► Commits ──► Worldview
                                                        │
                                           Actions ◄────┤
                                                        │
                                           Outcomes ────► Calibration
```

| Concept | What it is |
|---------|------------|
| **Assertion** | A structured claim: `subject → relation → object` with a confidence (0–1) and supporting evidence. The atom of the worldview. |
| **Observation** | A raw signal — a data point, article, measurement, or event. The raw material assertions are built from. |
| **Patch** | A proposed revision to an assertion, triggered by new observations. Staged for review before taking effect. |
| **Commit** | An approved patch applied to the worldview. Stores a full before/after snapshot — the assertion's revision history. |
| **Action** | Something done *because of* an assertion — a decision, experiment, trade, publication, or deliberate pass. |
| **Outcome** | The result of an assertion being tested. Records what happened and how far off the confidence score was. |
| **Calibration** | Aggregate accuracy of confidence scores over all outcomes. The system's measure of how well it knows what it knows. |

Everything lives in `.reason/events.jsonl` and `.reason/snapshot.json` — append-only event log plus a materialised snapshot. No server, no sync, no cloud dependency.

---

## Designed for agents

`reason` is built to be a read/write substrate for AI agents, not just a human note-taking tool.

### Agents as writers

An agent running a research loop can continuously feed the worldview:

```sh
# Record what was just observed
reason observe --content "Q2 CPI came in at 2.9%, below consensus 3.1%" --source "BLS release 2026-07-15"

# Propose a revision to an existing assertion
reason patch asr_abc123 --confidence 0.72 --append-evidence "CPI miss suggests disinflation resuming" --reason "Below-consensus inflation print weakens rate-hold thesis"
```

### Agents as readers

Before acting, an agent can query the worldview to understand current assertions and their basis:

```sh
# What do we currently assert about inflation?
reason query inflation --json --explain

# What's the full worldview state?
reason status --json

# What actions are still open — waiting to be evaluated?
reason act --list --json
```

### Human oversight built in

Patches don't take effect until a human (or a designated review agent) approves them via `reason review`. This makes `reason` safe to use in autonomous loops — agents can propose revisions freely, but the worldview only changes when a commit is explicitly made.

```
agent proposes patch → human reviews → human commits → worldview updates
```

Use `--approve-all` to let an agent approve its own patches in a fully autonomous loop:

```sh
reason review --approve-all && reason commit
```

### Closing the loop

When an assertion is tested — an experiment concludes, a prediction resolves, an action produces an outcome — `reason eval` records what happened and calculates calibration delta. Over time this produces a structured record of where the reasoning system is reliable and where it isn't.

---

## Install

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/yourname/reason
cd reason
bun install
bun build src/cli.ts --compile --outfile reason
ln -s $(pwd)/reason ~/.local/bin/reason
```

---

## Quickstart

```sh
# Initialise a reasoning repository in any project directory
reason init

# Add an assertion
reason assert --subject "US inflation" --relation "is" --object "decelerating" \
  --confidence 0.72 --evidence "3 consecutive below-consensus CPI prints"

# Record an observation
reason observe --content "June CPI 2.9% vs 3.1% expected" --source "BLS 2026-07-15"

# Propose a revision based on new evidence
reason patch <id> --confidence 0.78 --append-evidence "June print confirms trend" \
  --reason "Further data supports deceleration thesis"

# Review and commit the patch
reason review
reason commit

# Record an action taken on an assertion
reason act <id> --type decision --description "Reduced duration hedge given disinflation signal"

# When the assertion resolves, record the outcome
reason eval <id> --result confirmed --description "Fed cut in September confirmed disinflation"

# See calibration across all outcomes
reason calibration
```

---

## Command reference

### Core workflow

| Command | What it does |
|---------|-------------|
| `reason init` | Initialise a reasoning repository in the current directory |
| `reason assert` | Add a new assertion to the worldview |
| `reason observe` | Record a raw observation |
| `reason patch <id>` | Propose a revision to an existing assertion |
| `reason review [--approve-all]` | Approve or reject pending patches |
| `reason commit` | Apply approved patches and write commit records |
| `reason eval <id>` | Record an outcome and measure calibration |

### Inspection

| Command | What it does |
|---------|-------------|
| `reason status [--json]` | Current worldview snapshot — assertions, patches, open actions, calibration |
| `reason query <kw> [--explain] [--json]` | Search across assertions, observations, commits, and actions |
| `reason log` | Full commit history |
| `reason diff [id]` | What changed in the last commit (or a specific one) |
| `reason calibration [--json]` | Accuracy breakdown by confidence bucket and relation type |
| `reason failures [--json]` | Assertions that have been refuted — recurring reasoning errors |

### Actions

| Command | What it does |
|---------|-------------|
| `reason act [id]` | Record an action taken because of an assertion |
| `reason act --list [--json]` | Show all open actions |

---

## The revision cycle

```
assert → observe → patch → review → commit → act → eval → calibration
           ▲                                              │
           └──────────────── informs next cycle ─────────┘
```

The goal is not to be right. The goal is to have an accurate model of *how right you tend to be* — and to improve that over time. Calibration is the feedback signal. The revision history is the audit trail. Together they turn an assertion store into a reasoning system that learns.

---

## Design principles

**Domain-agnostic.** `reason` has no concept of stocks, markets, research fields, or any specific domain. It is infrastructure for structured reasoning in any context — trading, scientific research, product strategy, geopolitical analysis, or anything else where assertions should be tracked and tested.

**Revision is first-class.** Changing your mind is not a failure state — it's the intended workflow. Every revision is recorded with its trigger observation and rationale. The history of how an assertion evolved is as valuable as the assertion itself.

**Calibration over conviction.** High confidence is not the goal. Accurate confidence is. The eval loop exists to measure the gap between stated confidence and actual outcomes, so the system can identify where it over- or underestimates its own certainty.

**Human oversight by default.** Patches require explicit review and commit. Agents can write observations and propose changes freely, but the worldview only advances through deliberate approval. This makes autonomous loops safe to operate.

**Local-first.** Your assertions live in files on your machine. There is no cloud service, no authentication, no API rate limits, and no data leaving your environment.
