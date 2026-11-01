# T-008-10 — Design gate G1, app shell, sign-in and shared components

| Field | Value |
|---|---|
| Task | `T-008-10` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US1 sign-in states, US9) |
| Branch / PR | `T-008-10-shell-and-shared` / PR linked from the merge commit; earlier pieces in PR #58 (tokens) and PR #59 (design hand-off, G1) |
| Date | 2026-11-01 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The Claude Design hand-off is in `specs/008-dashboard/design/`, and gate G1 was approved by
Alex (PR #59). On that basis the dashboard has its designed shell (`tasks.md` Phase 2,
T016–T021):
- a sticky sidebar: 208 px on desktop, icon-only and expandable on tablet, a Sheet on phone;
- a top bar whose screen title is the page's only `h1`, with the gateway status pill, the
  theme toggle (dark by default, persisted, no flash) and the operator menu (sign out);
- a skip link, toasts, and a session-expired dialog that signs in again in place;
- the sign-in page with its wrong-passphrase, rate-limited countdown and session-ended
  states.

The shared components every screen task will use are in `src/features/shared/`:
- residency, outcome, privacy action, circuit and pass/fail badges;
- the sensitivity indicator, entity chips, target label and fallback marker;
- the region states (loading, empty, error, stale) and the entry detail drawer;
- the money, number and time formatters.

Playwright covers US9-1 (axe, both themes), US9-2, US9-5 and US9-6. The six unbuilt
screens show a "not built yet" region inside the shell.

## Files touched

- `apps/dashboard/src/components/ui/*` (new): shadcn/ui button, badge, tooltip, sheet,
  dialog, dropdown-menu, popover, skeleton, sonner, separator, input, label, card, alert.
- `apps/dashboard/src/features/shared/{badges,privacy,region-states,entry-detail,format}.ts(x)` (new).
- `apps/dashboard/src/features/shell/{app-shell,gateway-status,passphrase-form,session-expired-dialog,logo,not-built}.tsx` (new).
- `apps/dashboard/src/app/(console)/layout.tsx`: the shell and the session dialog. The old
  plain `gateway-status.tsx` and `sign-out-button.tsx` are removed. The seven pages render
  `NotBuilt` and no longer their own `h1`.
- `apps/dashboard/src/app/(auth)/sign-in/{page,sign-in-form}.tsx`: the designed page.
- `apps/dashboard/src/app/providers.tsx`: `TooltipProvider`, `Toaster`, and the 401 →
  session-expired context through the query and mutation caches.
- `apps/dashboard/src/lib/api-client.ts`: `BffRequestError.retryAfterSeconds`.
- `apps/dashboard/src/proxy.ts`: a cookie that no longer verifies redirects to
  `/sign-in?session=expired`.
- `apps/dashboard/e2e/{shell,accessibility}.spec.ts`, `e2e/support/axe.ts` (new);
  `e2e/auth.spec.ts`, `e2e/support/gateway.ts` (exact `Passphrase` label; sign out through the
  operator menu); `test/format.test.ts` (new).
- `apps/dashboard/package.json`: radix-ui, sonner, class-variance-authority, lucide-react,
  `@axe-core/playwright` (exact versions).
- `specs/008-dashboard/tasks.md` (T016–T021 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **The shadcn components use the design's animations**, not `tw-animate-css`. Sheet,
  Dialog, Tooltip, Dropdown and Popover use `animate-sheet-in`, `animate-dialog-in` and
  `animate-fade-in` from the tokens, which already have their reduced-motion versions. The
  Tooltip uses the design's popover style (bordered, `bg-popover`) instead of shadcn's
  inverted one, and Skeleton uses `bg-muted` with `motion-reduce:animate-none`.
- **The operator menu is not modal.** A modal Radix menu marks the rest of the page
  `aria-hidden`, which axe reports as `aria-hidden-focus` (serious). Escape and outside
  clicks still close it.
- **The gateway pill's secondary text drops `opacity-80`.** At 80 % it fell below 4.5:1 in
  light mode (axe `color-contrast`).
- **The axe helper waits for finite animations to end** before measuring, so a menu still
  fading in is not reported as low contrast.
- **The theme toggle switches light and dark only**, as designed (decision 7 of the design
  README). The system preference is enabled in next-themes but has no control, so US9-5's
  "system" option is not selectable from the UI. Raised with Alex; not widened here.
- **The sidebar footer ("Policy default · v3") is left out** until the dashboard can read
  the policy, which is the BFF `/api/policy` of `T-008-08`.
- **Region error texts are specific** ("Gateway unreachable", "Credentials rejected",
  "Unexpected answer", or the gateway's own message with its request id), taken from the BFF
  error type rather than the design's single sample text.
- **Shared components live in `src/features/shared/`** as `tasks.md` T021 says, not in
  `components/tamiz/` as `design/components.md` suggests.
- **`shadcn add` (4.23.0) again resolved the `cn` helper to the npm package `cn`.** It was
  removed and the imports point at `@/lib/utils`. The dependency versions it wrote were
  pinned exactly.

## How it was verified

```bash
pnpm lint        # Checked … files. Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 564 dependencies cruised)
pnpm test        # Test Files 134 passed (134); Tests 1399 passed | 34 skipped (1433)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 14 passed
```

The shell and the sign-in page were checked by hand against
`design/screenshots/shell-default-dark-1440.png` and the sign-in frames, at 1440 px in
both themes.

## Pending / follow-ups

- The screens: `T-008-03` (Live traffic), `T-008-04` (Simulator), `T-008-05` (Audit log),
  `T-008-06` (Cost), `T-008-07` (Evals), `T-008-11` (Providers), `T-008-08` (Policy editor).
  Each adds its screen to `e2e/accessibility.spec.ts`.
- The system theme option (above) if Alex wants it.
- The Playwright suite still does not run in CI; that is `T-008-09`.
- No new backlog rows.

## Pitfalls for the next session

- **After `shadcn add`, grep for `from "cn"`** and fix the imports; then remove the `cn`
  package and pin the versions it added.
- **Biome's `useLiteralKeys` fix conflicts with `noPropertyAccessFromIndexSignature`**: keep
  `searchParams["session"]` and do not run `biome check --write --unsafe` on such files.
- **Writing multi-line scripts through a Bash heredoc on this machine can mangle
  backslashes**; use the Write tool for scripts.
- **A stale `next start` can keep a port** after a session ends. Check
  `netstat -ano | grep :<port>` before trusting what the browser shows.
- **`getByLabel("Passphrase")` also matches the "Show passphrase" button**; use
  `{ exact: true }`.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (design in `specs/008-dashboard/design/`)
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-02-dashboard-skeleton.md`,
  `docs/tasks/done/T-008-12-policy-admin-api.md`
