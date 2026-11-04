# T-AUD-10 — Readability refactors

| Field | Value |
|---|---|
| Task | `T-AUD-10` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (gateway, dashboard, MCP server, evals) |
| Spec | — (`docs/audit/2026-11-03-code-audit.md`) |
| Branch / PR | `T-AUD-10-readability` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done (two small items kept, see Decisions) |

## What was done

This task covers the readability findings of the code audit
(`docs/audit/2026-11-03-code-audit.md`). Every commit keeps the behaviour, except two small
fixes the audit listed with them (L6, L8).

**Casts (L1):**

- No `as unknown as` is left in any `src/` folder.
- `RoutingFailure` has a top-level `kind`, so presentation narrows it without a cast.
- `definedOnly` builds the audit query.
- The routing-events log sink reads fields through a `Map`.
- The MCP HTTP app keeps the helper's type.

**`main.ts` (L2):**

- It reads as wiring: `connectPersistence`, `bootPolicies`, `buildAudit` and
  `registerShutdown` hold the choices between adapters.
- The audit log and its reader are chosen together, which removes the in-memory cast.
- It has no other cast left.

**Duplication (L3, L16, L17):**

- one `recordFailure` for both tracing wrappers;
- one `callModel` for both agent protocols;
- one `totalPricePerMillion`;
- `entityCounts` reused;
- each dataset checks its own offsets.

**Brands (L4):**

- The audit keeps `Usd`.
- Policy validation brands through the `*Unchecked` helpers.

**Dead code (L5):** `anonymizeMessages` and `verifyApiKey` are removed, and their tests now
use the real functions.

**Two small fixes:**

- **L6:** the audit's baseline is used only when the active policy is the version that
  decided the request.
- **L8:** the OTLP endpoints are validated at boot.

**Logs (L7):** a stream's request log line says `streamed` and `timeToHeadersMs` instead of
a misleading `durationMs`.

**Dashboard (L14):**

- The 647-line policy editor is now four files: editor, header, side panel and conflict
  dialog.
- One `CARD` class replaces nine copies, and one `useNow` replaces three.

## Files touched

- Gateway: `src/main.ts`, `src/presentation/{app.ts,routes/chat-completions.ts,routes/admin/audit.ts,mappers/defined-only.ts}`, `src/application/{use-cases/route-inference.ts,use-cases/stream-inference.ts,use-cases/inspect-sensitivity.ts,audit/with-audit.ts,tracing/with-tracing.ts}`, `src/domain/model/{audit-entry.ts,baseline.ts,model-target.ts,placeholders.ts,routing-decision.ts,routing-policy.ts}`, `src/infrastructure/{auth/api-keys.ts,config/env.ts,persistence/audit-log-repository.ts,telemetry/log-routing-events.ts,README.md}`, and their tests.
- MCP server: `src/agent/run-agent.ts`, `src/transports/http.ts`.
- Evals: `src/datasets.ts`, `src/eval.ts`, `src/runner.ts`, `src/evals/{leak,detection}.ts`, `test/datasets.test.ts`.
- Dashboard: `src/features/policy-editor/editor/{policy-editor,policy-header,side-panel,conflict-dialog}.tsx`, `src/features/shared/{card.ts,use-now.ts}`, and the screens that used the copies.

## Decisions

- **Two casts are kept, each with its reason.**
  - `routes/chat-completions.ts` returns the event stream `as never`, because
    `@hono/zod-openapi` types a route's 200 as its JSON schema. It also narrows statuses to
    the route's declared ones, a cast to a literal union, not a double cast.
  - `domain/model/privacy-policy.ts` keeps one `as TargetId`. Calling `targetIdUnchecked`
    there makes `units.ts → errors.ts → privacy-policy.ts` circular, and dependency-cruiser
    refuses it.
- **The helpers stay in `main.ts`.** Only `main.ts` may import from `infrastructure/`
  (constitution I). Moving them into other files would break the rule they serve.
- **The two date-range popovers stay separate.** The audit filter's popover edits two
  query parameters with a clear button; the cost screen's builds a range with presets.
  They share their markup idiom, not their behaviour.
- **L6 leaves the baseline out instead of carrying the deciding policy through every
  result.** The race is a request in flight during a policy save. An absent baseline is
  honest; a wrong one was not.

## How it was verified

```bash
pnpm typecheck                     # clean
pnpm exec vitest run apps/gateway  # 868 passed, 36 skipped (with T-AUD-06 merged in)
pnpm exec vitest run apps/dashboard apps/mcp-server packages/evals   # 133, 80, 97 passed
pnpm arch                          # no dependency violations
```

There is no `as unknown as` left in any `apps/*/src` or `packages/*/src`.

## Pending / follow-ups

None. `T-AUD-11` reviews the result.

## Pitfalls for the next session

- **`RouteInference` failures have a top-level `kind` now** (`chain` or `blocked`). A new
  producer must set it.
- **The `@tamiz/contracts` `dist/` follows the branch last built.** Rebuild it after
  switching branches, or consumer tests read another branch's schemas.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (L1-L8, L14, L16, L17)
- Related task records: `docs/tasks/done/T-AUD-05-gateway-robustness.md`, `docs/tasks/done/T-AUD-06-operations.md`
