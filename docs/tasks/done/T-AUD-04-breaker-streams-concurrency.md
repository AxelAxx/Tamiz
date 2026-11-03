# T-AUD-04 — Circuit breaker under streams and concurrent requests

| Field | Value |
|---|---|
| Task | `T-AUD-04` (see `docs/tasks/BACKLOG.md`) |
| Feature | `003-resilience`, `006-audit-and-telemetry` |
| Spec | `specs/003-resilience/spec.md` (FR-006 … FR-009, FR-024), `specs/006-audit-and-telemetry/spec.md` (FR-013) |
| Branch / PR | `T-AUD-04-breaker-streams-concurrency` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

This task fixes the audit's resilience findings (`docs/audit/2026-11-03-code-audit.md`):

- **H3:** a stream now records its circuit outcome when it ends, a success at `finish` and
  a failure at a mid-stream `error`. Before, it recorded success at the first token, so a
  target that always failed after its first token reset its own count and never opened
  (FR-024).
- **H4:** `onResult` drops the outcome of a `call` that was admitted while the circuit was
  closed, once the circuit is no longer closed. A late success no longer closes a circuit
  another request opened, and a late failure no longer extends the cool-down or
  re-announces the opening. `onResult` now answers whether it opened the circuit, and the
  chain stops retrying a target the same request has just opened.
- **M4:** an exhausted chain reports the last target it tried, with that target's error.
  It no longer reports a later target that was skipped.
- **M5:** provider health no longer counts a target skipped for an open circuit as a
  request and an error. The fix is in both readers: in memory (`targetWindows`) and
  PostgreSQL (`window`).

## Files touched

- `apps/gateway/src/application/resilience/circuit-breaker.ts`: stale `call` outcomes dropped; `onResult` returns `opened`.
- `apps/gateway/src/application/resilience/execute-chain.ts`:
  - `deferSuccess` and `Served.admission`;
  - no retry once the circuit opens;
  - the reported target of an exhausted chain.
- `apps/gateway/src/application/use-cases/stream-inference.ts`: success at `finish` and failure at `error`, both with the stream's real admission, so a half-open trial is settled by its stream.
- `apps/gateway/src/application/audit/aggregates.ts`, `src/infrastructure/persistence/audit-log-repository.ts`: `circuit_open` skips are not attempts.
- Tests:
  - `test/resilience/circuit-breaker.test.ts` (3);
  - `test/resilience/execute-chain.test.ts` (2, plus `admission` in two expectations);
  - `test/application/stream-inference.test.ts` (2);
  - `test/admin/providers-route.test.ts` (1);
  - `test/persistence/cost-report.test.ts` (a `circuit_open` entry in the SQL-vs-memory fixture).

## Decisions

- **Deferring success, rather than resetting the count after a mid-stream failure.**
  The alternative was to count a mid-stream failure twice, which would hide the cause. A
  stream's health is known only at its end, and recording it there also settles a
  half-open trial correctly: a trial that dies mid-stream now reopens the circuit.
  Before, it was recorded as a plain `call`.
- **"No longer closed" means the outcome is dropped, both success and failure.** Once
  another request has opened the circuit, only a half-open trial may change it again.
  With a shared store (Valkey), the snapshot read and the update are two operations. A
  concurrent change between them is still possible, but the window is one round trip
  instead of the whole call.
- **No more retries on a target this request has opened.** The failure is returned as
  non-retryable, so `withRetry` stops and the chain moves to the next target. The
  `fallback` event and the audit keep the original cause.

## How it was verified

```bash
pnpm exec vitest run apps/gateway   # before the fix: 7 new tests failed; after: 848 passed, 35 skipped
pnpm --filter @tamiz/gateway typecheck   # clean
pnpm arch                                # no dependency violations
pnpm exec biome check apps/gateway       # no errors (pre-existing infos only)
```

Two of the new tests were not seen failing first:

- the M5 `targetWindows` test was written after the fix;
- the PostgreSQL parity fixture needs Docker, which this machine lacks. CI runs it with
  Testcontainers.

## Pending / follow-ups

None. A stream that ends without `finish` or `error` (audit M7) records no outcome; that
is `T-AUD-05`.

## Pitfalls for the next session

- **`Served.admission` matters only with `deferSuccess`.** For completions the chain has
  already recorded the outcome. Calling `onResult` again would count it twice.
- **Health has two readers.** `targetWindows` (in memory) and the PostgreSQL `window`
  query must agree, and `cost-report.test.ts` compares them. Change both together.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (H3, H4, M4, M5)
- Related task records: `docs/tasks/done/T-AUD-01-code-audit.md`
