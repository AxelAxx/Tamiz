# T-AUD-03 — Agent eval that cannot be passed by naming the baseline

| Field | Value |
|---|---|
| Task | `T-AUD-03` (see `docs/tasks/BACKLOG.md`) |
| Feature | `009-mcp-agent` (agent-eval addendum) |
| Spec | `specs/009-mcp-agent/` agent-eval addendum (FR-026 … FR-029) |
| Branch / PR | `T-AUD-03-agent-eval-baseline` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The code audit (`docs/audit/2026-11-03-code-audit.md`, H2) found that the agent eval could
be passed without finding the cause:

- the fixture's baseline target was `anthropic-sonnet`;
- every cost observation names the baseline;
- 5 of the 8 cases expected `anthropic-sonnet`.

So an answer that always named sonnet and copied the two totals scored 5/8 = 62.5 %. That
is above the 60 % gate, and it is the figure the README published.

Now the fixture's baseline is `frontier-baseline`, an id no case uses as a route. The
dataset is `agent-spend.v2.jsonl`: v1's 8 cases plus 7 new ones, five per cause
(`anthropic-sonnet`, `mistral-small`, `openai-mini`). Naming one route every time now
scores at most 1/3.

The README evals table is regenerated from this PR's CI run. It also carries the
`T-AUD-02` dataset changes.

## Files touched

- `packages/evals/datasets/agent-spend.v2.jsonl` (new; v1 removed): 15 cases. The new cases include:
  - falls;
  - Spanish questions;
  - distractor routes whose request counts change more than their cost.
- `packages/evals/src/evals/agent.ts`: the baseline id, exported; dataset v2; the header explains why.
- `packages/evals/test/agent.test.ts`, two new tests:
  - no case uses the baseline as a route;
  - for every route, a fixed answer naming it with both totals copied stays below the gate.
- `packages/evals/README.md`: the agent row.
- `README.md`: evals table from this PR's `evals-report`.
- `docs/tasks/BACKLOG.md`, three changes:
  - `T-AUD-03` is done;
  - new `T-AUD-11`, the second audit agreed with Alex on 2026-11-03;
  - `docs/tasks/done/T-AUD-02-recognizer-formats.md` now says where its README table went.

## Decisions

- **Change the fixture, not the scorer.** The alternative was to strip mentions of the
  baseline before matching routes. That breaks when the baseline is also the cause. A
  baseline id outside the case routes removes the ambiguity, and the fixture is a
  synthetic world anyway.
- **Balanced causes, and enough cases.** With n = 15 and five per cause, a fixed answer
  scores 1/3, well under 0.6. A test guards this for every route of the dataset, so a later
  case that unbalances it fails CI.
- **The 0.6 gate is unchanged.** Whatever the model scores on v2 is the honest figure. If
  it falls below the gate, that is a finding about the agent, not a reason to move the gate.

## How it was verified

```bash
pnpm exec vitest run packages/evals     # 92 passed (2 new)
pnpm exec vitest run apps/mcp-server    # 79 passed
pnpm exec biome check packages/evals    # no errors
```

The agent's real score on v2 comes from the CI `evals` job, which runs `qwen2.5:3b`
through the gateway. The figure is in the README table of this PR.

## Pending / follow-ups

None.

## Pitfalls for the next session

- **Every observation repeats the baseline id.** A scorer that reads route names
  anywhere in the answer must never share a name with it.
- **The dashboard's bundled reports** (`apps/dashboard/data/evals/`) are snapshots of
  earlier runs and still say `agent-spend v1`. That is correct for those dates.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (H2)
- Related task records: `docs/tasks/done/T-009-07-agent-eval.md`, `docs/tasks/done/T-AUD-02-recognizer-formats.md`
