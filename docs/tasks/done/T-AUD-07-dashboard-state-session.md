# T-AUD-07 — Dashboard state and session fixes

| Field | Value |
|---|---|
| Task | `T-AUD-07` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US1, US2, US10) |
| Branch / PR | `T-AUD-07-dashboard-state-session` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done (one item moved to `T-AUD-09`) |

## What was done

The dashboard findings of the code audit (`docs/audit/2026-11-03-code-audit.md`) are
fixed.

**Live traffic:**

- **M13:** polls stop paging once a page ends with an entry that would not enter the view.
  The first load stops at 100 entries.
- **M14:** while paused, only entries newer than the oldest shown row wait as "new".
- **L11:** each highlight batch keeps its own timer, so a merge or a pause no longer
  cancels it. The failure count lives in the fetch, so the backoff really is 2, 4, 8, 16
  and 30 s.

**Session:**

- **M15:** a failed sign-out keeps the session and says so. A 401 still counts as signed
  out.
- **M16:** the session-expired dialog also offers "Explore as a visitor" when the session
  was a visitor's.
- **M17:** a failed policy reload keeps the draft and the conflict dialog open.
- **L13:** a failed session query makes the screens act as for a visitor, instead of
  leaving the policy screen on its skeleton.
- **L12:** `GET /api/session` answers 401 instead of assuming `operator`.

**Hardening:**

- **L12:** the sign-in limit counts the last `X-Forwarded-For` hop, the one the trusted
  proxy wrote.
- **L12:** security headers are added: `frame-ancestors 'none'`, `X-Frame-Options`,
  `nosniff` and `Referrer-Policy`.
- **L12:** the session cookie's flags now have a test.
- **L13:** the cost screen's empty state shows a custom range's real last day.

## Files touched

- Live traffic:
  - `apps/dashboard/src/features/live-traffic/model.ts`: `wouldEnter`; pending only for entries that would enter.
  - `apps/dashboard/src/features/live-traffic/use-live-traffic.ts`: paging stop, failure count in the fetch, per-batch highlight timers.
- Session:
  - `apps/dashboard/src/features/shell/app-shell.tsx`: sign-out failure toast.
  - `apps/dashboard/src/features/shell/session-expired-dialog.tsx`: visitor entry for a visitor session.
  - `apps/dashboard/src/features/shell/visitor-entry.tsx`: moved from `app/(auth)/sign-in/` so that a feature can use it; `onEntered`.
  - `apps/dashboard/src/features/shell/session-role.ts`: visitor fallback on error.
  - `apps/dashboard/src/app/api/session/route.ts`: 401 without a role.
- Policy and cost screens:
  - `apps/dashboard/src/features/policy-editor/editor/policy-editor.tsx`: failed reload.
  - `apps/dashboard/src/features/cost-analytics/{cost-view.ts,cost-analytics.tsx}`: `rangeDays`.
- Server and configuration:
  - `apps/dashboard/src/lib/server/{session.ts,session-cookie.ts,bff.ts}`: last-hop address; `sessionCookieHeader`, a pure function, so the flags are testable.
  - `apps/dashboard/next.config.ts`: security headers.
  - `apps/dashboard/.env.example`: what `TAMIZ_DASHBOARD_TRUST_PROXY` now means, and the lock-out trade-off when it is off.
- Tests:
  - `test/live-merge.test.ts` (2);
  - `test/session.test.ts` (2, plus a forged first hop);
  - `test/cost-view.test.ts` (1);
  - `e2e/auth.spec.ts` (failed sign-out);
  - `e2e/visitor.spec.ts` (expired visitor renewed in place).

## Decisions

- **No script or style CSP.** Next.js inlines its bootstrap scripts, so a strict
  `script-src` needs nonces from middleware on every page. That is a larger change than
  this task. The policy sent covers framing, `base`, forms and plugins. That is what
  clickjacking and injection-adjacent attacks need, and it cannot break a page.
- **The last `X-Forwarded-For` hop, not a hop count.** The documented deployments have
  one proxy in front of the dashboard: Vercel, and Caddy in compose. Each writes the
  address it saw as the last hop. A hop-count setting would be configuration for a
  deployment nobody runs.
- **Visitor as the error fallback.** It is the least privileged role. The server checks
  every write anyway, so the worst case is an operator seeing a read-only editor until
  the query succeeds.
- **The audit filter's sensitivity list moved to `T-AUD-09`.** It should come from the
  contract's sensitivity enum, which is written inline three times today. `T-AUD-09`
  makes it one exported enum. Doing it here would have meant exporting a duplicate.

## How it was verified

```bash
pnpm exec vitest run apps/dashboard        # before the model fix: 2 new tests failed; after: 131 passed
pnpm --filter @tamiz/dashboard typecheck   # clean
pnpm exec biome check apps/dashboard       # no errors (one pre-existing info)
```

**Not run locally: the Playwright suite.** It needs a production build and the E2E
gateway, which is too heavy for this machine. The CI job `e2e` runs both new specs.

## Pending / follow-ups

- The sensitivity options of the audit filter are now part of `T-AUD-09`.

## Pitfalls for the next session

- **`wouldEnter` relies on the audit API's order.** Pages are ordered by `createdAt`
  (finish time), newest first, while the view orders by `startedAt`. A request that
  started early and finished late is therefore near the top of the first page. That is
  why stopping at the first page that ends with a non-entering entry still catches it.
- **The visitor E2E tests each use their own `X-Forwarded-For`.** With the last-hop rule
  that still works, because a single value is its own last hop.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (M13-M17, L11-L13)
- Related task records: `docs/tasks/done/T-OPS-03-public-readonly-demo.md`, `docs/tasks/done/T-AUD-01-code-audit.md`
