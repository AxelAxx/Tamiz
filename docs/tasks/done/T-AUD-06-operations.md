# T-AUD-06 — Operations: shutdown, health checks, policy freshness

| Field | Value |
|---|---|
| Task | `T-AUD-06` (see `docs/tasks/BACKLOG.md`) |
| Feature | `001-contracts-and-skeleton` (health), `006-audit-and-telemetry`, `008-dashboard` (policy) |
| Spec | `specs/001-contracts-and-skeleton/spec.md` (FR-017), `specs/006-audit-and-telemetry/spec.md` (FR-004, FR-006) |
| Branch / PR | `T-AUD-06-operations` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done (two items of L10 left out, see Pending) |

## What was done

The operational findings of the code audit (`docs/audit/2026-11-03-code-audit.md`) are
fixed.

**M10 — shutdown:**

- Shutdown waits for the open requests, at most 8 s, before the last audit flush.
- An entry appended after `close` is reported as `audit.dropped` with reason `shutdown`.

**M11 — policy freshness:**

- With a database, the cached active policy is re-read at most every 5 s.
- A version saved through another gateway is in use within seconds.

**M12 — `/health`:**

- `/health` reports each dependency: the privacy service, the database and the shared
  circuit state.
- It answers `degraded` when the gateway works with less, and 503 when requests would
  fail.
- The dashboard's status pill shows "Degraded" and names the dependency.

**L10 — audit writes, privacy client and keys:**

- An audit batch that fails twice waits at the head of the queue for the next interval.
  Before, it was dropped.
- The privacy client releases the body of a non-OK answer.
- New script: `api-key:revoke`.

## Files touched

- Audit writer and shutdown:
  - `apps/gateway/src/infrastructure/persistence/async-writer.ts`: requeue within `maxQueue`; drop on the final flush only; `shutdown` drops after `close`.
  - `apps/gateway/src/application/ports/routing-events.port.ts`: `audit.dropped` reason `shutdown`.
  - `apps/gateway/src/main.ts`: bounded graceful shutdown; health probes wired.
- Health:
  - `apps/gateway/src/application/ports/health-probe.port.ts` (new), `src/infrastructure/health/probes.ts` (new): privacy, database and circuit-state probes, each with a fixed detail.
  - `apps/gateway/src/presentation/routes/health.ts`, `src/presentation/app.ts`: `checks`, `degraded`, 503.
  - `apps/gateway/src/infrastructure/cache/redis-circuit-state.ts`: `isShared()`.
- Policy and privacy client:
  - `apps/gateway/src/infrastructure/policy/postgres-policy-repository.ts`: `refreshEveryMs`.
  - `apps/gateway/src/infrastructure/privacy/http-pii-detector.ts`: cancel the unread body.
- Keys: `apps/gateway/scripts/revoke-api-key.ts` (new), `apps/gateway/package.json`.
- Dashboard:
  - `apps/dashboard/src/lib/server/gateway.ts`: `bodyOnStatus`.
  - `src/app/api/gateway-health/route.ts`: passes the health 503 on.
  - `src/features/shell/gateway-status.tsx`: the "Degraded" pill.
- Tests:
  - `test/persistence/async-writer.test.ts`: requeue, bound, close, after close;
  - `test/health.test.ts`: probes and statuses;
  - `test/persistence/policy-repository.test.ts`: two gateways and a fake clock, in CI;
  - `test/boot.integration.test.ts`: the boot env's absent privacy service is now reported;
  - `apps/dashboard/test/gateway.test.ts`: `bodyOnStatus`.
- `CLAUDE.md` §12, `docs/deploy.md`: the revoke command and what `/health` reports.

## Decisions

- **503 only for `down`, 200 for `degraded`.** Without the privacy service or the database
  every request fails, so the container should be unhealthy and receive no traffic. Under
  the in-memory circuit fallback the gateway works, just not shared. Marking it unhealthy
  would take a working gateway out of service.
- **The boot env's probes are real.** `boot.integration.test.ts` points at a privacy
  service that does not exist. Its `/health` is now 503 `degraded`, and the test asserts
  exactly that instead of a plain `ok`.
- **The policy is refreshed by polling, not `LISTEN/NOTIFY`.** It costs one indexed
  query every 5 s per gateway. A failed refresh keeps the cached policy, so a database
  blip never stops routing.
- **No retry before dropping in `close`.** On shutdown there is no next interval, so
  what cannot be written is reported as dropped. The writer still tries every batch
  twice.

## How it was verified

```bash
pnpm exec vitest run apps/gateway     # 848 passed, 36 skipped (PostgreSQL suites need Docker: CI)
pnpm exec vitest run apps/dashboard   # passed, including the 2 new gateway-client tests
pnpm --filter @tamiz/gateway typecheck ; pnpm --filter @tamiz/dashboard typecheck   # clean
pnpm arch                             # no dependency violations
```

Two pieces were not run locally:

- **The shutdown path.** It is exercised by stopping a container, which was not done here.
  The writer's `close` and after-close behaviour are unit-tested.
- **The two-gateway policy test.** It needs Docker, which this machine lacks. CI runs it.

## Pending / follow-ups

Two items of L10 are left out, with reasons:

- **A negative cache for unknown API keys.** It would delay a newly added key by the TTL,
  and flooding is better handled by a rate limit. The missing rate limit is already listed
  among the limitations in `docs/deploy.md`.
- **A 503 for a failed key lookup.** It needs a new error type in `@tamiz/contracts`. A
  lookup failure is a 500 `internal` today, which is accurate, if not ideal.

`T-AUD-11` should look at both again.

## Pitfalls for the next session

- **The runtime image has neither `pnpm` nor `tsx`.** `pnpm deploy --prod` ships `dist/`
  only, so key scripts run from a checkout that reaches the database, never through
  `docker compose exec gateway`.
- **`response.body.cancel()` must not be awaited** in the privacy client. With MSW it
  never settles, and the tests time out.
- **A gateway without a privacy service is now unhealthy.** Anything that starts one
  alone and waits for `/health` 200 will wait forever: start the privacy service first.
  CI already does.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (M10-M12, L10)
- Related task records: `docs/tasks/done/T-006-03-postgres-persistence.md`, `docs/tasks/done/T-AUD-01-code-audit.md`
