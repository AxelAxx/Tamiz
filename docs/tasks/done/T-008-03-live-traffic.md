# T-008-03 — Live traffic screen

| Field | Value |
|---|---|
| Task | `T-008-03` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US2, US9-3, US9-4) |
| Branch / PR | `T-008-03-live-traffic` / PR linked from the merge commit |
| Date | 2026-11-01 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The home screen of the dashboard shows requests as they are decided (spec 008 US2,
`tasks.md` Phase 3, T022–T025, design `screens/live.html`). It polls `/api/audit` every
2 s, asking from 5 minutes before the newest start time it has seen (research R-05). It
follows `nextCursor` while pages are full and keeps at most 100 rows, newest first, with
no duplicates. An entry that finishes late still lands in start order (US2-5).

On screen:
- a stream status;
- a summary of where the shown requests went (Local, EU, External, Blocked or failed,
  With critical entities) with a share bar;
- the rows: a five-column table on desktop, cards on phone;
- the entry detail drawer from T-008-10.

Behaviour:
- new rows are highlighted for 2 s and only fade under reduced motion (US9-3);
- a polite live region announces arrivals with a count, at most once every 10 s (US9-4);
- pause keeps the rows still and counts what waits; resume adds those rows once (US2-4);
- failed polls keep the rows, show "Retrying since …" with the last update, back off up to
  30 s, and recover on their own (US2-6).

## Files touched

- `apps/dashboard/src/features/live-traffic/model.ts` (new): the pure merge (by id, newest
  100, pause buffer, overlap window).
- `apps/dashboard/src/features/live-traffic/use-live-traffic.ts` (new): polling, cursor
  following, backoff, highlight timers, throttled announcements.
- `apps/dashboard/src/features/live-traffic/{traffic-list,live-traffic}.tsx` (new): the
  rows (table and phone cards), the stream header, the summary, the region states.
- `apps/dashboard/src/app/(console)/live/page.tsx`: renders the screen.
- `apps/dashboard/src/app/globals.css`: the reduced-motion overrides moved out of
  `@layer base` (see Decisions).
- `apps/dashboard/test/live-merge.test.ts` (new, T022);
  `apps/dashboard/e2e/live-traffic.spec.ts` (new, T023);
  `apps/dashboard/e2e/accessibility.spec.ts` (live traffic and its detail, both themes);
  `apps/dashboard/e2e/support/gateway.ts` (`appendAudit`, `auditEntry` builder).
- `specs/008-dashboard/tasks.md` (T022–T025 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **A bug in the delivered tokens, fixed here:** the `prefers-reduced-motion` overrides
  were inside `@layer base`, and the `animate-*` utilities live in a later layer, so they
  won and reduced motion never applied. The US9-3 test caught it. The overrides now sit
  outside any layer in `globals.css`; `design/tokens.css` stays as delivered.
- **CSS animations instead of Motion.** The highlight uses the design's `animate-row-in`
  and `row-fade` keyframes, so the `motion` package is not added (`tasks.md` T025 named it).
- **Rows of the first load are not highlighted or announced.** Only entries that arrive
  after the screen opened count as new; without this, every row flashed on load.
- **Backoff counts consecutive failures itself.** TanStack Query resets
  `fetchFailureCount` at the start of every fetch, so it cannot drive a growing interval.
- **The time button's accessible name starts with its visible text** ("12 s ago, open
  details for request …"). axe reported `label-content-name-mismatch` (WCAG 2.5.3) for the
  design's label.
- **A failed row says `failed: <error type>`** when the entry carries one, as US2-3 asks;
  the design's sample text "all targets failed" stays as the fallback.
- **Gateway outage in Playwright** is simulated by aborting `/api/audit` in the browser
  (`page.route`), not with a new control endpoint on the E2E gateway.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 564 dependencies cruised)
pnpm test        # Test Files 135 passed (135); Tests 1406 passed | 34 skipped (1440)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 25 passed (1.0m)
```

The screen was compared by hand with `design/screenshots/live-live-dark-1440.png` at
1440 px, using the E2E gateway and synthetic entries.

## Pending / follow-ups

- The audit log screen (`T-008-05`) reuses most of `traffic-list.tsx`. Generalise it there
  (absolute time column, request id), not before.
- No new backlog rows.

## Pitfalls for the next session

- **Old `next start` servers outlive their shell** and keep port 3199, 3210 or 3211; the
  browser then shows an old build and Playwright refuses to start. Use
  `powershell Get-NetTCPConnection -State Listen -LocalPort …` and stop the owning process.
- **A test that appends entries right after signing in races the first poll**: wait for
  "Showing N" before appending when the test needs the entry to count as new.
- **Unlayered CSS beats every `@layer`**: overrides of utilities have to sit outside layers
  (or use Tailwind variants such as `motion-reduce:`).

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (research R-05)
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-10-shell-and-shared.md`
