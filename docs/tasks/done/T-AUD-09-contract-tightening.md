# T-AUD-09 — Contracts: brands, shared enums, bounds

| Field | Value |
|---|---|
| Task | `T-AUD-09` (see `docs/tasks/BACKLOG.md`) |
| Feature | `001-contracts-and-skeleton`, `004-privacy-service`, `006-audit-and-telemetry` |
| Spec | `packages/contracts` (constitution II) |
| Branch / PR | `T-AUD-09-contract-tightening` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done (branded DTO types left out, see Decisions) |

## What was done

This task fixes the contract findings of the code audit
(`docs/audit/2026-11-03-code-audit.md`).

**One source per enum:**

- `InspectedSensitivitySchema` is `unknown` plus `SensitivityLevelSchema`. The audit
  entry, the audit query and the simulation use it, and the dashboard's audit filter
  takes its options from the contract.
- `AuditBlockReasonSchema` is the single list of block reasons. The simulation derives
  its own with `.exclude(["residency"])`.

**Bounds the schemas state themselves:**

- A chat request has at most `CHAT_MESSAGES_MAX` (1,024) messages, a model name of at
  most 200 characters, and `max_tokens` of at most 1,000,000.
- The MCP simulation's `messages` share the 32,000-character budget of its `text`.
- The audit `route` and `rule` filters are slugs.
- `CostQuerySchema` refuses a range that does not end after it starts, so the MCP tool
  refuses one before calling the gateway.

**Tighter fields and smaller fixes:**

- `policyId` and `ruleId` cannot be empty, and cost amounts must be finite.
- The privacy service's 400 for an unknown key names the key's parent, never the key: the
  caller's key may be the secret (L19).
- The test-utils request builder sets only the required fields (L21).

## Files touched

- Contracts:
  - `packages/contracts/src/routing-policy.ts`: `InspectedSensitivitySchema`.
  - `packages/contracts/src/audit.ts`: `AuditBlockReasonSchema`; `policyId` and `ruleId` not empty.
  - `packages/contracts/src/simulate.ts`, `src/admin.ts`, `src/mcp.ts`, `src/chat-completion.ts`, `src/index.ts`: the shared enums, the bounds, the cost refine and the exports.
  - `packages/contracts/test/bounds.test.ts` (new).
- `apps/dashboard/src/features/audit-log/filter-bar.tsx`: options from the contract.
- `apps/mcp-server/test/tools-audit-cost.test.ts`: an inverted range is refused locally, and the gateway is never called.
- Privacy service:
  - `services/privacy/src/privacy/api/errors.py`: `extra_forbidden` names the parent.
  - `tests/api/test_errors.py`, `tests/api/test_anonymize.py`: the secret as a key.
- `packages/test-utils/src/builders.ts`: minimal defaults.

## Decisions

- **No branded types in the audit and cost DTOs** (M21, partly). A branded `RequestId`
  or `Usd` in those schemas would brand every DTO the dashboard, the MCP server and their
  tests build. Each fixture would then need a cast, which trades one audit finding for
  dozens of casts.
  - What the brands protect is enforced instead: the strings cannot be empty and the
    amounts must be finite and non-negative.
  - The gateway domain keeps its brands. `T-AUD-10` restores `Usd` through the audit
    inside the gateway.
- **`CostQuerySchema` validates its own order.** The gateway route keeps its check for
  the OpenAPI message. The MCP tool now refuses an inverted range locally. Before, it
  relayed the gateway's 400.
- **Bounds are generous on purpose.** They exist to make the contract honest, not to
  limit real use: the 1 MiB body cap still comes first.

## How it was verified

```bash
pnpm typecheck                     # every package, clean
pnpm exec vitest run               # 1518 passed, 35 skipped
pnpm exec biome check .            # no errors
cd services/privacy && uv run pytest -m "not nlp" -q && uv run ruff check . && uv run mypy \
  && uv run python scripts/export_openapi.py --check   # 267 passed; clean; openapi.json up to date
```

## Pending / follow-ups

- Branded DTO types, see Decisions. `T-AUD-11` decides whether they are worth it.

## Pitfalls for the next session

- **Rebuild `@tamiz/contracts` before typechecking its consumers**
  (`pnpm --filter @tamiz/contracts build`). The other packages read its `dist/`.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (M21, L13, L18, L19, L21)
- Related task records: `docs/tasks/done/T-AUD-07-dashboard-state-session.md`, `docs/tasks/done/T-AUD-08-evals-agent-errors.md`
