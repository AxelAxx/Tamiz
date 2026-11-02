# T-008-11 — Provider health screen

| Field | Value |
|---|---|
| Task | `T-008-11` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US8) |
| Branch / PR | `T-008-11-provider-health` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The providers screen shows which targets are failing (spec 008 US8, `tasks.md` Phase 8,
T047–T048, design `screens/providers.html`). It reads `GET /api/providers`, which existed
since `T-008-02`.

- **One card per declared target**, idle ones included. Each card shows:
  - the target id, provider and model, and the residency badge;
  - the circuit badge: closed, half open, or open with "retry in N s";
  - attempts, errors, error rate and latency p50/p95 over the window.
- **An idle target** says "idle: no attempts in this window" and shows "—" for its error
  rate and latencies. A rate over zero attempts is not 0 %.
- **An open circuit's card** has the danger ring and the note "requests skip this target;
  fallbacks take over". A half-open card says the next request is a trial.
- **The window picker** offers 5, 15 or 60 minutes. The line next to it names the window
  the numbers come from ("Last 60 min · updated 3 s ago"). While a new window loads, the
  previous numbers stay, dimmed.
- **Refresh**: every 10 s (US8-2). The cool-down counts down each second in between. When
  it reaches zero, the screen asks again at once instead of waiting for the next refresh.
- **States**: skeleton cards while loading; the region error with Retry; a stale note when
  a refresh fails over data already on screen.

## Files touched

- `apps/dashboard/src/features/provider-health/{model.ts,provider-health.tsx}` (new).
- `src/app/(console)/providers/page.tsx`.
- `apps/dashboard/test/provider-health.test.ts` (new).
- `apps/dashboard/e2e/providers.spec.ts` (new, T047).
- `e2e/accessibility.spec.ts`: providers with an open circuit, in both themes.
- `e2e/support/gateway.ts`: `gateway.openCircuit`.
- `specs/008-dashboard/tasks.md` (T047–T048 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **The countdown starts from when the browser received the report**, not from
  `generatedAt` as `tasks.md` T048 put it. A clock difference between the gateway and the
  browser would otherwise stretch or skip it. The remaining time is the gateway's
  `cooldownRemainingMs`.
- **Error rates from 20 % up are shown in the danger colour**, and any error count over
  zero too. The threshold is for display only. The spec sets none and the gateway sends
  none; the design showed 5.3 % plain and 33.3 % red.
- **Cards, as the design draws them**, rather than the table rows the spec's wording
  suggests. Each card is a `section` named by its target id, with its figures in a `dl`.
- **The window lives in component state**, not in the address, like the cost screen's
  range. It is not a filter worth sharing.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 140 passed (140); Tests 1471 passed | 6 skipped (1477)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 69 passed
```

- **US8-1** compares every card with the E2E gateway's own `GET /v1/admin/providers`.
- **US8-2** opens a circuit after the first load, so only a refresh can show it. It then
  checks that the countdown goes down.
- **US8-3** seeds one entry 30 minutes ago, so the 15- and 60-minute windows differ.

Checked by hand at 1440 and 390 px against `design/screenshots/providers-*-dark-*.png`.

## Pending / follow-ups

- No new backlog rows.

## Pitfalls for the next session

- **`POST /__e2e/circuit` with a cool-down longer than the policy's** (30 s in
  `policies/default.yaml`) makes the gateway read the circuit as half-open. The domain
  treats an `openUntil` further away than one cool-down as a clock that moved backwards.
  Keep test cool-downs under 30 s.

## Links

- Spec / plan / tasks: `specs/008-dashboard/`
- ADRs: none added
- Related task records: `docs/tasks/done/T-006-06-cost-and-providers.md`, `docs/tasks/done/T-008-07-eval-results.md`
