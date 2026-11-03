# Tasks: Agent Eval (addendum to 009)

Backlog `T-009-07`, one pull request.

## Scenario coverage

| Scenario | Task |
|---|---|
| US1-1 the real agent on fixture data | A03, A05 |
| US1-2 scoring | A04 |
| US1-3 content-free report | A04 |
| US1-4 below threshold fails CI | A08 |
| US2-1 CI model passes | A08 (CI run) |
| US2-2 cost report as text | A06 |
| US2-3 change per route | A06 |

## Tasks

- [x] A01 `EVAL_IDS` gains `agent` (`packages/contracts/src/evals.ts`).
- [x] A02 `AgentCaseSchema` and `agent-spend.v1.jsonl` (8 cases); a test checks every
  case's totals and cause against its own data.
- [x] A03 `runAgentOnFixture` in `apps/mcp-server/src/agent/fixture-run.ts`; package
  `exports` and declarations.
- [x] A04 `packages/evals/src/evals/agent.ts`: fixture cost report, scorer, summary; tests
  in `packages/evals/test/agent.test.ts`.
- [x] A05 Config `TAMIZ_EVAL_AGENT_GATEWAY_URL`, `_MODEL`, `_PROTOCOL`; the eval is
  registered; the README and dashboard labels.
- [x] A06 `apps/mcp-server/src/agent/observation.ts`, used by both protocols; tests in
  `apps/mcp-server/test/observation.test.ts` and updated `agent.test.ts`.
- [x] A07 Prompts `system.v3` (text) and `system.v4` (native) with computed dates, two
  calls and an answer template.
- [x] A08 `quality-ci.yaml` v2 (`ollama-agent`, `pinned-agent`); the CI `evals` step sets
  the agent variables; threshold `answer_accuracy ≥ 0.60`.
