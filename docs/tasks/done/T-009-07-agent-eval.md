# T-009-07 — Agent eval and a local model that answers

| Field | Value |
|---|---|
| Task | `T-009-07` (see `docs/tasks/BACKLOG.md`) |
| Feature | `009-mcp-agent` (addendum `agent-eval/`) |
| Spec | `specs/009-mcp-agent/agent-eval/{spec,plan,tasks}.md` (FR-026 … FR-031, SC-007, SC-008) |
| Branch / PR | `T-009-07-agent-eval` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done; the spec addendum is approved with the PR |

## What was done

`T-009-06` showed that no local model answered the demo question correctly, and nothing
measured it.

- **The agent eval** (constitution IV):
  - eval id `agent` in `@tamiz/contracts`;
  - the dataset `agent-spend.v1.jsonl`: 8 synthetic spend questions, English and
    Spanish, rises and falls, several causes, and a zero-cost route with many requests as
    a distractor;
  - the eval runs the real agent and its real MCP server in process, through
    `runAgentOnFixture`, exported by `@tamiz/mcp-server`. Only the model calls go to the
    gateway;
  - the gate: `answer_accuracy ≥ 0.60`.
- **Changes to the agent**, each found by reading failing answers:
  1. Cost reports reach the model as short text. The frontier baseline is set apart as
     "not money spent"; it had been read as the previous day.
  2. A second cost report grouped by route also lists each route's change, earlier period
     first, largest first. The subtraction was the main failure.
  3. Prompts `system.v3` (text) and `system.v4` (native) give yesterday's and the day
     before's dates already computed, the two exact calls, and an answer template. For
     the text protocol the template is inside the JSON.
- **CI**: the `evals` job runs the agent eval through the existing quality gateway.
  `quality-ci.yaml` v2 adds `ollama-agent` (`qwen2.5:3b`, already pulled as the judge) and
  the rule `pinned-agent` for model `tamiz-agent`. The text protocol is used there.
- **Labels and docs**: the README results table and the dashboard's evals screen gain the
  `agent` label and the new metric names. `packages/evals/README.md`,
  `apps/mcp-server/README.md` and `CLAUDE.md` §10 are updated.

## Measurements

All runs local, on CPU, over the 8 cases of the dataset.

| Model | Protocol | Before (v1/v2, JSON results) | After (v3/v4) |
|---|---|---|---|
| `llama3.1:8b` | native (the demo default) | 12.5 % | 87.5 % (before the template), 75 % (final) |
| `llama3.1:8b` | text | 12.5 % | 50 %: three cases hit the 60 s Ollama timeout of `default.yaml` |
| `qwen2.5:3b` | native | — | 12.5 %: it asks for `groupBy: "day"` whatever the prompt says |
| `qwen2.5:3b` | text (the CI setting) | — | 62.5 %, 87.5 %, 87.5 %, 87.5 % |

Intermediate steps on `llama3.1:8b` native:
- 12.5 % at the start;
- 37.5 % with the text observation and two calls;
- 50 % with the change lines;
- 87.5 % with the computed dates;
- 75 % in the final run, with the template.

## Files touched

- `packages/contracts/src/evals.ts`: `agent` added to `EVAL_IDS`.
- `packages/evals/`:
  - `datasets/agent-spend.v1.jsonl` (new);
  - `src/evals/agent.ts` (new);
  - `src/{datasets,config,thresholds,cli}.ts`, `src/report/readme.ts`;
  - `policies/quality-ci.yaml`;
  - `test/agent.test.ts` (new) and the config literals of two tests;
  - `package.json` (depends on `@tamiz/mcp-server`);
  - `README.md`.
- `apps/mcp-server/`:
  - `src/agent/{fixture-run,observation}.ts` (new);
  - `src/agent/run-agent.ts` (formatter, dates, prompt versions);
  - `prompts/system.v3.md`, `prompts/system.v4.md` (new);
  - `test/observation.test.ts` (new), `test/agent.test.ts`;
  - `package.json`: `exports`, and `@modelcontextprotocol/client` moved to dependencies;
  - `tsconfig.build.json` (declarations);
  - `README.md`.
- `apps/dashboard/src/features/eval-results/model.ts`: labels.
- `apps/gateway/test/policy/policy-files.test.ts`: `pinned-agent`.
- `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/tasks/BACKLOG.md`,
  `specs/009-mcp-agent/tasks.md`, `specs/009-mcp-agent/agent-eval/` (new).

## Decisions

The full list is plan D1 … D6. The ones a reader might question:

- **The agent does the arithmetic, not a new tool.** The change lines are presentation of
  two results the model already asked for. They work for any two periods and any
  grouping, and need no change to the MCP tool contracts.
- **The threshold is 0.60, not the measured ~0.8.** CPU inference varies run to run even
  at temperature 0 (one of four runs was 62.5 %). At 0.60 the gate catches a return to
  12.5 % without failing CI on a one-case wobble. Raising it is a one-line reviewed change
  once CI history shows the spread.
- **CI uses `qwen2.5:3b`, text protocol**, the best measured combination that fits a CI
  runner. The demo default stays `llama3.1:8b` native, which is not gated.
- **The scorer is lexical** (spec Assumptions). It requires the cause to be the first
  route named; it does not check the cause's two daily amounts. One passing
  `qwen2.5:3b` answer gave the cause's change as its first amount.
- **The evals package now imports app code.** The agent eval runs the agent itself. This
  is one exported module, and the README says so.

## How it was verified

```bash
pnpm lint && pnpm typecheck && pnpm arch && pnpm build && pnpm test   # 1477 passed, 35 skipped (Docker stopped: the Testcontainers suites skip; CI runs them)
TAMIZ_EVAL_AGENT_GATEWAY_URL=http://localhost:3000 TAMIZ_EVAL_API_KEY=<demo> pnpm evals -- --only agent   # llama, default.yaml
TAMIZ_EVAL_AGENT_MODEL=tamiz-agent TAMIZ_EVAL_AGENT_PROTOCOL=text pnpm evals -- --only agent      # qwen, quality-ci.yaml mounted in the compose gateway
```

In the PR's CI run the agent eval passed at 75 %. The `evals` job grew from about 6.5 to
18.5 minutes of its 25-minute limit, so a follow-up PR raised `timeout-minutes` to 40.

## Pending / follow-ups

- **The README results table** (`pnpm evals:readme`) is regenerated from a `main` run's
  `evals-report` artifact, as before. It gains the agent row after the first merge run.
- **More agent questions** (audit lookups, provider health) need a new dataset version.
  This one covers only spend.

## Pitfalls for the next session

- **`llama3.1:8b` on CPU can exceed `default.yaml`'s 60 s Ollama timeout** with the longer
  text-protocol prompts. Those cases show up as "no answer" after 2 calls.
- **To try another local model**, mount a policy into the compose gateway (it has none
  but the shipped ones), and use a new policy id or a higher version (see `T-OPS-05`).
- **The eval keeps answers out of the report.** To read them while iterating, call
  `runAgentOnFixture` from a scratch script: `fixtureCostReport` and `scoreAgent` are
  exported for that. Do not commit the script.
- **The first route named decides.** A prompt that makes the model list every route
  before naming the cause fails the scorer, even if the cause is right.

## Links

- Spec addendum: `specs/009-mcp-agent/agent-eval/`
- Related task records: `docs/tasks/done/T-009-06-agent-demo-recording.md`,
  `docs/tasks/done/T-009-04-mcp-agent.md`, `docs/tasks/done/T-007-06-evals-ci-job.md`
