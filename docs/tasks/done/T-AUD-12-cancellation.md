# T-AUD-12 — Client cancellation is not a provider failure; fail-closed edges

| Field | Value |
|---|---|
| Task | `T-AUD-12` (see `docs/tasks/BACKLOG.md`) |
| Feature | `003-resilience`, `005-privacy-aware-routing`, `006-audit-and-telemetry` |
| Spec | `specs/003-resilience/spec.md` (FR-006 … FR-009, edge cases) |
| Branch / PR | `T-AUD-12-cancellation` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done (G5 and G6 not changed, see Decisions) |

## What was done

This task fixes the gateway findings of the second audit
(`docs/audit/2026-11-04-second-audit.md`).

- **G1:** a half-open trial that ends because the client went away no longer reopens the
  circuit. `aborted` never counts as a provider failure: by the time an outcome reaches
  the breaker, the request deadline has surfaced as `timeout`. The trial's lease expires
  and another request tries.
- **G4:** a non-streamed client disconnect is now a `cancelled` chain failure, audited as
  `cancelled`, as streams already were. Provider health no longer counts it as an error,
  and inspection no longer emits `privacy.detector_failed` for a client that left.
- **G2:**
  - The HTTP detector refuses overlapping or unsorted findings as a contract failure, so
    the request fails closed.
  - `anonymizeTexts` marks a span that goes past the text, or past an earlier span, as
    `unsafe`, so nothing is sent.
- **G3:** a call to an undeclared tool cancels the upstream provider call on both stream
  paths.
- **G-M10:** each shutdown closer runs even if an earlier one throws.
- **G-M12:** the privacy probe keeps a path prefix in `TAMIZ_PRIVACY_URL`.

## Files touched

- `apps/gateway/src/application/resilience/{circuit-breaker,execute-chain}.ts`: `counts` and the `cancelled` failure.
- `apps/gateway/src/application/audit/with-audit.ts`: `cancelled` in `failureResult`.
- `apps/gateway/src/application/use-cases/inspect-sensitivity.ts`: no detector alert on a client abort.
- `apps/gateway/src/domain/model/placeholders.ts`: unsafe on an overlap or an out-of-range span.
- `apps/gateway/src/infrastructure/privacy/http-pii-detector.ts`: refuses overlapping findings.
- `apps/gateway/src/infrastructure/llm/ai-sdk-provider.ts`: `call.cancel()` on an undeclared tool.
- `apps/gateway/src/infrastructure/health/probes.ts`: the probe URL is relative to the base.
- `apps/gateway/src/main.ts`: independent closers.
- Tests:
  - `test/resilience/circuit-breaker.test.ts`: the abandoned trial;
  - `test/resilience/execute-chain.test.ts`: an outer abort is `cancelled`;
  - `test/domain/placeholders.test.ts`: overlap and out-of-range;
  - `test/privacy/http-pii-detector.test.ts`: overlapping findings;
  - `test/application/inspect-sensitivity.test.ts`: no alert for a client that left;
  - `test/health.test.ts`: the probe keeps the prefix.

## Decisions

- **A spec edge case changes.** Spec 003 counted an `aborted` trial as failed, so that a
  trial cut off by the request deadline would reopen the circuit. In the code as built,
  the deadline never reaches the breaker as `aborted`, so the rule only ever punished a
  provider for a client closing its tab. The comment in `circuit-breaker.ts` gives the
  reason.
- **G5 (no audit entry when a use case throws) is unchanged.** An audit entry needs the
  routing decision, and a throw before or during the decision leaves none. `app.onError`
  already logs such errors with the request id. Inventing a decision-less entry would
  change the audit contract. `T-AUD-16` can revisit it.
- **G6 (lease of a long streaming trial) is unchanged.** Renewing a lease needs a new port
  operation on both circuit stores. The effect is at most a second concurrent trial
  against a provider that is already answering, which is not a safety problem. It is
  noted for `T-AUD-16`.

## How it was verified

```bash
pnpm exec vitest run apps/gateway   # 872 passed, 36 skipped
pnpm --filter @tamiz/gateway typecheck ; pnpm arch   # clean
```

## Pending / follow-ups

- G5 and G6, see Decisions (`T-AUD-16`).

## Pitfalls for the next session

- **`ChainFailure` has a `cancelled` kind now.** `failureResult` maps it to an audit
  `cancelled`. Presentation still answers with the error's own status, which no client
  reads, since the client is gone.

## Links

- Audit: `docs/audit/2026-11-04-second-audit.md` (G1-G6, G-M10, G-M12)
- Related task records: `docs/tasks/done/T-AUD-04-breaker-streams-concurrency.md`, `docs/tasks/done/T-AUD-05-gateway-robustness.md`
