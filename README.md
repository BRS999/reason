<div align="center">
  <img src="galaxy.png" height="200" alt="reason" />

  <h1>reason</h1>

  <p><strong>A version controlled assertion store for AI agents and the humans who work with them.</strong></p>

  ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
  ![Bun](https://img.shields.io/badge/runtime-Bun-black)
  ![License](https://img.shields.io/badge/license-MIT-green)

  [Overview](#overview) · [Why reason?](#why-reason) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Commands](#command-reference) · [Roadmap](#roadmap)
</div>

---

### Overview

Most AI systems act on what they know right now. `reason` is infrastructure for what they assert over time — a persistent, inspectable repository where assertions are first-class objects with history, evidence, confidence, and calibration.

AI agents have a context window, not a worldview. Every session starts cold. Observations get made, decisions get taken, and then everything evaporates — there is no record of what was asserted, why, or whether it turned out to be right. `reason` solves that.

---

### Why reason?

#### The problem

- AI agents are stateless by default — reasoning is rebuilt from scratch every session
- There is no standard way to track how an assertion was formed, revised, or tested
- Confidence scores are asserted but never measured against outcomes
- Autonomous agent loops have no safe mechanism for proposing and reviewing worldview changes

#### reason solves this by

- Giving agents a **durable assertion store** that persists across sessions and accumulates over time
- Making every assertion **traceable** — each one carries its evidence, revision history, and the observations that triggered changes
- Closing the **calibration loop** — outcomes are recorded against assertions and confidence scores are measured against reality
- Providing **human oversight by default** — agents can propose revisions freely, but the worldview only advances through deliberate review and commit

---

### Architecture

The store is an **append-only event log** (`events.jsonl`) with a materialised snapshot (`snapshot.json`) for fast reads. Every write produces typed events — `assertion_created`, `patch_proposed`, `commit_created` — making the full history of the worldview replayable and auditable.

#### Core concepts

| Concept | What it is |
|---------|------------|
| **Assertion** | A structured claim: `subject → relation → object` with a confidence (0–1) and supporting evidence. The atom of the worldview. |
| **Observation** | A raw signal — a data point, article, measurement, or event. The raw material assertions are built from. |
| **Patch** | A proposed revision to an assertion, triggered by new observations. Staged for review before taking effect. |
| **Commit** | An approved patch applied to the worldview. Stores a full before/after snapshot — the assertion's revision history. |
| **Action** | Something done *because of* an assertion — a decision, experiment, trade, publication, or deliberate pass. |
| **Outcome** | The result of an assertion being tested. Records what happened and how far off the confidence score was. |
| **Calibration** | Aggregate accuracy of confidence scores over all outcomes — the system's measure of how well it knows what it knows. |

#### Storage layout

```
.reason/
  events.jsonl     — append-only event log (source of truth)
  snapshot.json    — materialised current state (fast reads)
```

---

### Designed for agents

`reason` is built to be a read/write substrate for AI agents, not just a human note-taking tool.

#### Agents as writers

An agent running a research loop can continuously feed the worldview:

```sh
# Record what was just observed
reason observe --content "Q2 CPI came in at 2.9%, below consensus 3.1%" \
  --source "BLS release 2026-07-15"

# Propose a revision to an existing assertion
reason patch asr_abc123 \
  --confidence 0.72 \
  --append-evidence "CPI miss suggests disinflation resuming" \
  --reason "Below-consensus print weakens rate-hold thesis"
```

#### Agents as readers

Before acting, an agent can query the worldview to understand current assertions and their basis:

```sh
# What do we currently assert about inflation?
reason query inflation --json --explain

# Full worldview state
reason status --json

# Actions still open — waiting to be evaluated
reason act --list --json
```

#### Human oversight built in

Patches don't take effect until explicitly reviewed and committed. This makes `reason` safe to operate in autonomous loops:

```
agent proposes patch → human reviews → human commits → worldview updates
```

For fully autonomous agent loops, `--approve-all` bypasses the interactive review step:

```sh
reason review --approve-all && reason commit
```

#### Closing the loop

When an assertion is tested — an experiment concludes, a prediction resolves, an action produces an outcome — `reason eval` records what happened and calculates calibration delta. Over time this produces a structured record of where the reasoning system is reliable and where it isn't.

---

### Quick Start

**Prerequisites:** [Bun](https://bun.sh) v1.0+

```sh
# 1. Clone and build
git clone https://github.com/yourname/reason
cd reason
bun install
bun build src/cli.ts --compile --outfile reason

# 2. Add to PATH
ln -s $(pwd)/reason ~/.local/bin/reason

# 3. Initialise a reasoning repository in any project directory
cd your-project
reason init

# 4. Add your first assertion
reason assert \
  --subject "US inflation" \
  --relation "is" \
  --object "decelerating" \
  --confidence 0.72 \
  --evidence "3 consecutive below-consensus CPI prints"
```

---

### The revision cycle

1. **Assert** what you think is true, with confidence and supporting evidence
2. **Observe** new information as it arrives
3. **Patch** assertions when observations change what is known
4. **Review** and **commit** when the revision is warranted
5. **Act** when an assertion leads to a concrete decision
6. **Eval** when the assertion is tested — record what happened and how far off confidence was

Over time, `reason calibration` reveals whether 70% assertions are hitting 70% of the time — and which reasoning patterns are systematically miscalibrated.

---

### Command reference

#### Core workflow

| Command | What it does |
|---------|-------------|
| `reason init` | Initialise a reasoning repository in the current directory |
| `reason assert` | Add a new assertion to the worldview |
| `reason observe` | Record a raw observation |
| `reason patch <id>` | Propose a revision to an existing assertion |
| `reason review [--approve-all]` | Approve or reject pending patches |
| `reason commit` | Apply approved patches and write commit records |
| `reason eval <id>` | Record an outcome and measure calibration |

#### Inspection

| Command | What it does |
|---------|-------------|
| `reason status [--json]` | Current worldview — assertions, patches, open actions, calibration |
| `reason query <kw> [--explain] [--json]` | Search across assertions, observations, commits, and actions |
| `reason log` | Full commit history |
| `reason diff [id]` | What changed in the last commit (or a specific one) |
| `reason calibration [--json]` | Accuracy breakdown by confidence bucket and relation type |
| `reason failures [--json]` | Assertions that have been refuted — recurring reasoning errors |

#### Actions

| Command | What it does |
|---------|-------------|
| `reason act [id]` | Record an action taken because of an assertion |
| `reason act --list [--json]` | Show all open actions |

---

### Design principles

**Domain-agnostic.** `reason` has no concept of stocks, markets, research fields, or any specific domain. It is infrastructure for structured reasoning in any context — trading, scientific research, product strategy, geopolitical analysis, or anything else where assertions should be tracked and tested.

**Revision is first-class.** Changing your mind is not a failure state — it is the intended workflow. Every revision is recorded with its trigger observation and rationale. The history of how an assertion evolved is as valuable as the assertion itself.

**Calibration over conviction.** High confidence is not the goal. Accurate confidence is. The eval loop exists to measure the gap between stated confidence and actual outcomes, so the system can identify where it over- or underestimates its own certainty.

**Human oversight by default.** Patches require explicit review and commit. Agents can write observations and propose changes freely, but the worldview only advances through deliberate approval. This makes autonomous loops safe to operate.

**Local-first.** Assertions live in files on your machine. There is no cloud service, no authentication, no API rate limits, and no data leaving your environment.

---

<div align="center">
  <sub>Built with Bun + TypeScript</sub>
</div>
