# T-008-05 — Audit log screen

| Field | Value |
|---|---|
| Task | `T-008-05` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US4) |
| Branch / PR | `T-008-05-audit-log` / PR linked from the merge commit |
| Date | 2026-11-01 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The audit log answers "what happened to requests like this?" (spec 008 US4, `tasks.md`
Phase 5, T031–T033, design `screens/audit.html`).

- **Filters** live in the URL and are parsed field by field with `AuditQuerySchema`, so an
  address can be shared and an invalid value is dropped with a notice (US4-3). The filters
  are the date range (presets, "Any time" or a custom UTC range) plus route, rule,
  sensitivity, privacy action, entity kind and outcome.
- **The filter bar** shows active filters as removable chips with "Clear all", and becomes
  a "Filters (N)" bottom sheet on phone.
- **Entries** come newest first, 50 at a time. "Load older" follows the gateway's keyset
  cursor without repeats and ends with a disabled "No older entries" (US4-2).
- **Empty and invalid states**: the empty state names the active filters and offers to
  clear them (US4-4). A start after the end is refused next to the dates and nothing is
  sent (US4-5).
- **The table** has column headers; rows are reachable by keyboard and open the same detail
  as live traffic (US4-6).

## Files touched

- `apps/dashboard/src/features/audit-log/{filters.ts,filter-bar.tsx,audit-log.tsx}` (new);
  `src/app/(console)/audit/page.tsx` (in a `Suspense` boundary for `useSearchParams`).
- `apps/dashboard/src/features/shared/traffic-list.tsx`: moved from `live-traffic/`, with an
  `audit` variant (absolute start time in UTC, request id, rule column from `xl`).
- `apps/dashboard/src/app/api/policy/route.ts` (new): BFF `GET /api/policy`;
  `src/lib/api-client.ts` (`api.policy`); `e2e/support/fixtures.ts` (the endpoint joins the
  401 and key-leak checks).
- `apps/dashboard/test/audit-filters.test.ts` (new, T031); `e2e/audit-log.spec.ts` (new,
  T032); `e2e/accessibility.spec.ts` (the audit log in both themes).
- `specs/008-dashboard/tasks.md` (T031–T033 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **BFF `GET /api/policy` arrives here**, not with the editor: the rule picker needs the
  active policy's rules (research R-07). `PUT` stays with `T-008-08` (T043).
- **No TanStack Table.** `tasks.md` T033 names it in manual mode, but the gateway's order is
  the order and there is no client sorting or filtering. The shared `TrafficList` already
  renders the design's table and cards, so a table library would add a dependency for
  nothing (constitution X).
- **Native `<select>` and `datetime-local` inputs** stand in for shadcn `Select` and
  `Calendar`, as the design's own notes allow. They are accessible by default, and
  `Calendar` would add `react-day-picker`. The custom range is read as UTC and the popover
  says so.
- **No date filter by default ("Any time")**; the design's default was "Last 24 hours". A
  preset writes absolute `from`/`to` into the URL, so a shared address shows the same
  window to everyone.
- **A value in the URL that the pickers do not list** (for example a rule removed from the
  policy) stays selected, so the filter is still visible and removable.
- **Detail "from a link" is not built.** No screen links to a single entry yet; the drawer
  supports its loading and not-found states for when one does.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 137 passed (137); Tests 1421 passed | 34 skipped (1455)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 46 passed (1.6m)
```

## Pending / follow-ups

- No new backlog rows.

## Pitfalls for the next session

- **`getByLabel` matches substrings**: a select labelled "Entity kind" also matches the chip
  button "Remove filter Entity kind". Use `{ exact: true }`.
- **`useSearchParams` needs a `Suspense` boundary** in the page, or `next build` fails the
  static render.
- **Old E2E servers keep ports 3210/3211** after a manual check; stop them
  (`Get-NetTCPConnection -State Listen -LocalPort 3210,3211`) before running Playwright.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (research R-07)
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-03-live-traffic.md`
