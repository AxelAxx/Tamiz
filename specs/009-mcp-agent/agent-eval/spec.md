# Feature Specification: Agent Eval and a Local Model That Answers (addendum to 009)

**Feature Branch**: `T-009-07-agent-eval`

**Created**: 2026-11-03

**Status**: Approved with the pull request of `T-009-07` (Alex reviews it there)

**Input**: Backlog `T-009-07`: "An agent dataset under `packages/evals/datasets/` and a
threshold; iterate `system.v*` prompts and the tool-result format; seen failures: baseline
taken for the previous day, native `llama3.1:8b` stops after one call."

**Where this lives**: an addendum folder, `specs/009-mcp-agent/agent-eval/`, like
`tool-calling/`. It completes SC-004 of spec 009, which `T-009-06` recorded as partially
met. Requirement numbers continue the spec 009 series: the tool-calling addendum ended at
FR-025.

**Builds on**: `007-evals-gate` (runner, report, thresholds, the CI `evals` job) and
`009-mcp-agent` (the agent, its prompts, the MCP tools).

## Purpose

The demo question "why did spend rise yesterday?" was answered wrongly by every local
model and protocol in `T-009-06`, and nothing measured it, so a prompt change could only be
judged by one run of one question. Constitution IV says every AI behaviour has a versioned
dataset and a threshold. This addendum adds both and then changes the agent until a local
model passes.

## User Scenarios & Testing

### User Story 1 - The agent's answers are measured (Priority: P1)

A maintainer changes the agent's prompt or tool-result format and wants to know whether
answers got better, without a database or a hand-run demo.

**Independent Test**: `pnpm evals -- --only agent` against a gateway with a local model.

**Acceptance Scenarios**:

1. **Given** the dataset `agent-spend.v1.jsonl`, **When** the agent eval runs, **Then**
   each case runs the real agent with its tools on an in-process MCP server that answers
   from the case's cost history, and only the model calls go to the gateway.
2. **Given** a case's answer, **When** it is scored, **Then** it passes only if the run
   answered within 6 model calls, names the expected route before any other route of the
   case, and contains both daily totals within half a cent.
3. **Given** a run, **When** the report is written, **Then** it holds `answer_accuracy`,
   `model_calls_mean` and, per failing case, the checks that failed, the route named first
   and the call count, never answer text.
4. **Given** `answer_accuracy` below its threshold, **When** the CI `evals` job runs,
   **Then** the job fails.

### User Story 2 - A local model answers the demo question (Priority: P1)

**Acceptance Scenarios**:

1. **Given** the CI model (`qwen2.5:3b`, text protocol), **When** the eval runs, **Then**
   `answer_accuracy` is at least the threshold.
2. **Given** a cost report, **When** the agent's model reads it, **Then** it reads spent
   amounts per row, the total, and the frontier baseline set apart as "not money spent".
3. **Given** a second cost report grouped by route over another period in the same run,
   **When** the model reads it, **Then** it also reads each route's change between the two
   periods, earlier period first, largest change first.

## Requirements

- **FR-026**: A versioned synthetic dataset `packages/evals/datasets/agent-spend.v1.jsonl`
  with spend questions (English and Spanish, rises and falls, several causes, a zero-cost
  route with many requests as a distractor), each with per-route costs for two UTC days and
  the expected cause and daily totals.
- **FR-027**: The eval runs the agent against fixture admin data
  (`runAgentOnFixture`, exported by `@tamiz/mcp-server`); its model calls go to the
  gateway configured by `TAMIZ_EVAL_AGENT_GATEWAY_URL`, with `TAMIZ_EVAL_AGENT_MODEL`
  (default `tamiz-local`) and `TAMIZ_EVAL_AGENT_PROTOCOL` (default `native`).
- **FR-028**: Scoring as in US1-2. The gated metric is `answer_accuracy`; threshold
  **≥ 0.60** in `packages/evals/src/thresholds.ts`.
- **FR-029**: The report follows spec 007: no answer text, failing cases by id with
  content-free fields.
- **FR-030**: The agent renders `get_cost_report` results as text (US2-2, US2-3); other
  tool results stay JSON. The run record still holds no tool result.
- **FR-031**: Prompt versions `system.v3` (text) and `system.v4` (native) replace v1 and
  v2 as the defaults. They give the computed dates of yesterday and the day before, the two
  exact calls, and an answer template; v1 and v2 stay in the repository for history.

## Success Criteria

- **SC-007**: The CI `evals` job runs the agent eval on `qwen2.5:3b` (text protocol) and
  passes at ≥ 0.60. Measured locally before merge: 62.5 %, 87.5 %, 87.5 %, 87.5 % in four
  runs; before this addendum 12.5 %.
- **SC-008**: The demo default (`llama3.1:8b`, native protocol) improves from 12.5 % to at
  least 75 % on the same dataset (measured 75 % and 87.5 %). It is not gated: CI has no
  8B model.

## Assumptions

- **Local CPU inference is not deterministic** even at temperature 0, so the threshold is
  set below the measured runs. It catches a regression to the old behaviour (12.5 %), not
  a one-case wobble.
- **The scorer is lexical.** It does not check the cause route's two daily amounts, only
  that the route is named first and the totals appear. An answer can name the right route
  with a wrong amount and still pass; the totals check limits how wrong it can be.
- **Only the spend question is covered.** Other agent questions (audit lookups, provider
  health) need their own cases in a later dataset version.
