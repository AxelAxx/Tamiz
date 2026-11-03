# T-AUD-08 — Eval runner, judge and agent error handling

| Field | Value |
|---|---|
| Task | `T-AUD-08` (see `docs/tasks/BACKLOG.md`) |
| Feature | `007-evals-gate`, `009-mcp-agent`, `010-citara-integration` |
| Spec | `specs/007-evals-gate/spec.md`, `specs/009-mcp-agent/`, `specs/010-citara-integration/data-model.md` |
| Branch / PR | `T-AUD-08-evals-agent-errors` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done (two items moved, see Pending) |

## What was done

This task fixes the evals, MCP-agent and Citara findings of the code audit
(`docs/audit/2026-11-03-code-audit.md`).

**Eval runner and judge:**

- **M18:** the eval pool stops taking cases at the first failure. It waits for the calls
  in flight before it rethrows, so nothing keeps calling the gateway or the judge during
  the next eval.
- **M19:** the judge reads its verdict with the balanced-brace JSON extractor the agent
  already used, now shared. A rationale with `{x}` no longer fails the parse. The prompt
  is filled in one pass, so `$'` or a `{{answer}}` inside a text stays text.

**Citara example:**

- **M20:** a network error during the audit check reports `audit_error: unreachable`. The
  run no longer crashes and loses the answer.
- **L21:** the page size is `AUDIT_PAGE_MAX` from the contract.

**Cost eval and quality baseline:**

- **L15:** a target missing from the price file is an eval error (`unpriced_target`). It
  used to count as $0.
- **L15:** a test keeps `POLICY_FILE` equal to the policy the routing dataset names, and
  the header comment now says what the code does.
- **L15:** `baselines/quality.json` is validated with a schema. A bad edit names the file
  and the paths, then exits 2.

**MCP agent:**

- **L16:** an error that is neither an API answer nor a failed connection is reported as
  `agent_error`, no longer as `gateway_unreachable`.
- **L16:** the agent eval lets harness errors surface as `internal`.
- **L16:** an empty native reply is an observation error, so the model is asked again.
  The stale `PROMPT_VERSION` export is removed.

## Files touched

- Shared JSON extractor:
  - `apps/mcp-server/src/agent/json-object.ts` (new): `firstJsonObject`, moved from `action.ts`.
  - `apps/mcp-server/package.json`: exports `./agent/json-object`.
  - `apps/mcp-server/src/agent/action.ts`: uses `firstJsonObject`.
- `apps/mcp-server/src/agent/run-agent.ts`: empty native reply; `agent_error`; no `PROMPT_VERSION`.
- Evals:
  - `packages/evals/src/runner.ts`: `pool`, exported for its test.
  - `packages/evals/src/clients/judge.ts`: `renderPrompt`, `parseVerdict`.
  - `packages/evals/src/evals/cost.ts`: unpriced target is an error; the header comment.
  - `packages/evals/src/evals/quality.ts`, `src/cli.ts`: `QualityBaselineSchema`; exit 2 with the paths.
  - `packages/evals/src/evals/agent.ts`: no blanket "gateway unavailable".
- Citara example:
  - `examples/citara-client/src/audit-check.ts`: `unreachable`; `AUDIT_PAGE_MAX`.
  - `specs/010-citara-integration/data-model.md`: the `audit_error` values.
- Tests:
  - `packages/evals/test/runner.test.ts`: pool order and limit; stop on failure.
  - `test/quality-cost.test.ts`: nested braces; literal `$` and slot names; unpriced target; the routing header's policy.
  - `apps/mcp-server/test/agent.test.ts`: empty native reply.
  - `examples/citara-client/test/unit/audit-check.test.ts`: unreachable.

## Decisions

- **The shared extractor lives in the MCP server.** `packages/contracts` holds schemas
  only, and the evals package already depends on `@tamiz/mcp-server` for the agent
  fixture. An exported module there adds no dependency.
- **An unpriced target is a `ServiceError("gateway", "unpriced_target")`.** It means the
  gateway runs another policy than the one priced, which is a setup error. The runner
  already reports such errors as `error`, with exit 2.
- **The cost eval keeps a fixed policy path.** It does not read the path from the dataset
  header at run time: `prepare` does not receive the dataset, and a test that compares
  the two catches drift just as well.

## How it was verified

```bash
pnpm exec vitest run packages/evals apps/mcp-server   # 175 passed
pnpm exec vitest run --project @tamiz/example-citara-client   # 72 passed
pnpm --filter @tamiz/{evals,mcp-server,example-citara-client} typecheck   # clean
pnpm exec biome check examples packages/evals apps/mcp-server   # no errors
```

Two of the new tests were not seen failing first:

- the unpriced-target test;
- the empty-reply test.

Both cover branches that did not exist before. The pool test fails against the old pool:
it asserts that the call in flight has finished before the rejection.

## Pending / follow-ups

- **`checkOffsets` re-parses every case against the leak and detection schemas** (L17).
  This is a readability refactor and moves to `T-AUD-10`.
- **Tests for the leak eval's `detector_failed` path and for the agent `observe`
  mapping** (L17). Both need a full simulate or agent fixture with a fake gateway, which
  is larger than the rest of this task. `T-AUD-11` should check whether they are still
  missing.

## Pitfalls for the next session

- **Rebuild `@tamiz/mcp-server` before running the evals tests.** The evals package
  imports its `dist/` through the exports map, so after a change there run
  `pnpm --filter @tamiz/mcp-server build` first.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (M18-M20, L15-L17, L21)
- Related task records: `docs/tasks/done/T-007-05-quality-cost-evals.md`, `docs/tasks/done/T-009-07-agent-eval.md`, `docs/tasks/done/T-010-02-citara-guide-and-client.md`
