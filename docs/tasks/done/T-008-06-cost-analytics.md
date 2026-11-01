# T-008-06 — Cost analytics screen

| Field | Value |
|---|---|
| Task | `T-008-06` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US7) |
| Branch / PR | `T-008-06-cost-analytics` / PR linked from the merge commit |
| Date | 2026-11-01 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The cost screen shows actual spend against "everything to the most expensive target"
(spec 008 US7, `tasks.md` Phase 9, T049–T051, design `screens/cost.html`).

- **Controls**: a UTC range (last 7 days, last 30 days, this month, or a custom range of
  whole UTC days) and the grouping (day, route or model).
- **Six key figures**: actual, baseline, saving with its share, requests served, tokens
  in and out, and not served (blocked and failed, US7-3).
- **The chart**: a shadcn Chart (Recharts) with actual as solid bars and the baseline as
  hatched bars, named in the legend (US7-6).
- **The breakdown table** is the chart's accessible version; it has a totals row and
  becomes cards on phone.
- **The baseline note** names the baseline target and its prices.

The totals are the report's own, never recomputed (US7-1). Without a priced target the
baseline and the saving read "Not available", never $0 (US7-4). An empty range says so
(US7-5).

## Files touched

- `apps/dashboard/src/features/cost-analytics/{cost-view.ts,cost-chart.tsx,cost-analytics.tsx}`
  (new); `src/app/(console)/cost/page.tsx`.
- `apps/dashboard/src/components/ui/{chart,toggle,toggle-group}.tsx` (shadcn); `recharts`
  3.8.0 pinned.
- `apps/dashboard/test/cost-view.test.ts` (new, T049); `e2e/cost.spec.ts` (new, T050);
  `e2e/accessibility.spec.ts` (cost in both themes).
- `specs/008-dashboard/tasks.md` (T049–T051 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **The chart is hidden from assistive tech and cannot take focus.** The table carries the
  same numbers. Recharts 3 makes its chart focusable by default (`accessibilityLayer`),
  and axe reported that inside an `aria-hidden` container (`aria-hidden-focus`), so the
  layer is off.
- **The baseline series is hatched with an SVG pattern** of `--chart-2` stripes over a
  25 % tint. The legend says "Actual (solid)" and "Baseline (hatched)".
- **The grouping defaults to day** (US7-1 reads by day first); the design's default was
  route.
- **A custom range is whole UTC days, end day included**: it is sent as
  `[start 00:00Z, end + 1 day 00:00Z)`, matching how the gateway groups days. Native
  `type="date"` inputs stand in for shadcn `Calendar`, as in the audit log.
- **E2E figures come from the gateway**: the Playwright spec reads `GET /v1/admin/cost` on
  the E2E gateway with the same range and checks the screen against it, as `tasks.md`
  T050 asks.
- **Stock shadcn `chart.tsx` keeps three Biome exceptions**, with a reason each: a style tag
  built from the static chart config, and index keys on tooltip and legend rows.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 138 passed (138); Tests 1427 passed | 34 skipped (1461)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 55 passed before the
# chart fix, then accessibility + cost again: 19 passed
```

Checked by hand at 1440 px against `design/screenshots/cost-by-day-dark-1440.png`, with 30
days of synthetic entries.

## Pending / follow-ups

- No new backlog rows.

## Pitfalls for the next session

- **This session's first worktree disappeared mid-task** (its `.git` file and registration
  were gone, probably cleaned up after a merge). Git then resolved to the main checkout,
  and a `git checkout -b` switched Alex's main checkout to a new branch. It was switched
  back to `main` at once, with no file changes (same commit, clean tree), and the work
  moved to the worktree `t-008-06-cost-analytics`. Check `git rev-parse --show-toplevel`
  before any branch command.
- **`shadcn add` asks before overwriting an existing component** (here `card.tsx`); with
  `--yes` alone it stops. Use `--overwrite` and restore the file from git afterwards.
- **Recharts animates bars in**: a screenshot taken too early shows flat bars.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (research R-08)
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-05-audit-log.md`
