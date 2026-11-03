# Implementation Plan: Agent Eval (addendum to 009)

**Spec**: `specs/009-mcp-agent/agent-eval/spec.md` · **Backlog**: `T-009-07`

## Summary

Add an `agent` eval to the spec 007 runner. It runs the real MCP agent on fixture cost
data and sends only the model calls to the gateway. Then change the agent's tool-result
rendering and prompts until a local model passes, and gate the result in the CI `evals`
job.

## Technical context

- **Packages touched**:
  - `packages/contracts`: `EVAL_IDS` gains `agent`;
  - `packages/evals`: dataset, schema, config, eval, threshold, README label;
  - `apps/mcp-server`: `fixture-run.ts`, `observation.ts`, prompts v3/v4, declarations
    and the package `exports`;
  - `apps/dashboard`: the eval label and metric names;
  - `.github/workflows/ci.yml`.
- **No new service in CI.** The agent eval uses the existing quality gateway (port 3200,
  `quality-ci.yaml`). The policy gains `ollama-agent` (`qwen2.5:3b`, already pulled as the
  judge) and the rule `pinned-agent` for model `tamiz-agent`.
- **Constitution check**:
  - IV: the dataset and the threshold come before the claim that the agent answers;
  - V: answers stay out of the report;
  - VIII: the scorer, the fixture and the formatter are pure and unit-tested;
  - X: no new port; the fixture is a `fetch` function given to the existing gateway
    client.

## Decisions

| # | Decision | Rejected |
|---|---|---|
| D1 | The eval imports the agent from `@tamiz/mcp-server` (one exported module) | Running the MCP server and Postgres in CI: slower, and it measures the database, not the agent |
| D2 | The agent computes the per-route change between two cost reports and shows it in the observation | Leaving the subtraction to the model: the main failure in `T-009-06` |
| D3 | The prompt receives yesterday's and the day before's dates already computed | Date arithmetic by the model: repeated or wrong days |
| D4 | An answer template, inside the JSON for the text protocol | Free text: totals were dropped; plain-text replies broke the JSON protocol |
| D5 | CI: `qwen2.5:3b`, text protocol, threshold 0.60 | 0.75: one of four measured runs was 62.5 %; native protocol on qwen: 12.5 % (it ignores `groupBy`) |
| D6 | The scorer requires the cause to be the first route named | Any mention: "ollama-llama changed most … anthropic-sonnet …" would pass |

## Measurements (local, CPU, before merge)

| Model | Protocol | Before (v1/v2) | After (v3/v4) |
|---|---|---|---|
| `llama3.1:8b` | native | 12.5 % | 87.5 %, 75 % |
| `llama3.1:8b` | text | 12.5 % | 50 % (three cases hit the 60 s gateway timeout of `default.yaml` on CPU) |
| `qwen2.5:3b` | native | — | 12.5 % |
| `qwen2.5:3b` | text | — | 62.5 %, 87.5 %, 87.5 %, 87.5 % |
