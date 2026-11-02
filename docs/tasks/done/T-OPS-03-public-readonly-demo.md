# T-OPS-03 — Public read-only demo access

| Field | Value |
|---|---|
| Task | `T-OPS-03` (see `docs/tasks/BACKLOG.md`) |
| Feature | 008 (addendum: User Story 10, FR-025 … FR-029) |
| Spec | `specs/008-dashboard/spec.md` US10; `contracts/dashboard-bff.md`; `data-model.md` §3.1-3.3; `tasks.md` phase 11 |
| Branch / PR | `T-OPS-03-public-readonly-demo` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The question left open by `T-OPS-02` was who may use the public demo without the
passphrase. The answer is anyone, as a **visitor**, when the operator turns it on. The
passphrase stays private, because it also opens the policy editor.

- **Spec addendum** (`spec.md` US10, FR-025 … FR-029), written before the code. The BFF
  contract, the data model and `tasks.md` (phase 11, T057 … T061, coverage rows) are
  updated to match.
- **Configuration**: `TAMIZ_DASHBOARD_VISITOR_ACCESS`, `true` or `false`, default
  `false`. Any other value refuses to start.
- **Roles in the session store**: `create(role)` and `roleOf(cookie)`. The role lives
  only on the server; the cookie format is unchanged.
- **Endpoints**:
  - `POST /api/session/visitor` opens a visitor session. It checks the origin first. It
    answers `404 not_found` while visitor access is off, and allows 10 sessions a minute
    per address.
  - `GET /api/session` answers `{ role }`.
- **Wrappers** (constitution IX):
  - `withRole` refuses a session of another role with `403 forbidden_role` before the
    handler runs.
  - `bff.ts` now has four kinds of endpoint:

    | Kind | Allows | Used by |
    |---|---|---|
    | `read` | any session | — |
    | `write` | operators only | policy save |
    | `sessionWrite` | any session | sign-out |
    | `simulateWrite` | any session; visitors get 10 simulations a minute per address | simulator |
  - `rateLimited()` and `sessionCookie()` are shared helpers.
- **Screens**:
  - the sign-in page shows "Explore as a visitor" only when access is on;
  - the operator menu says "Visitor / Read-only demo session";
  - the policy editor opens read-only (CodeMirror `readOnly`, `aria-readonly`). It has
    no save or discard, and a note says that saving needs the operator passphrase.
  - Every other screen is unchanged.
- **Docs**:
  - `docs/deploy.md`: the Vercel variable, and section 6 rewritten;
  - the dashboard's `.env.example`;
  - `CLAUDE.md` §13: the decision is recorded and nothing is left open.

## Files touched

- `specs/008-dashboard/{spec,data-model,tasks}.md`, `specs/008-dashboard/contracts/dashboard-bff.md`.
- `apps/dashboard/src/lib/server/{env,session,handler,bff,context}.ts`,
  `apps/dashboard/src/lib/{schemas,api-client}.ts`.
- `apps/dashboard/src/app/api/session/route.ts`,
  `apps/dashboard/src/app/api/session/visitor/route.ts` (new),
  `apps/dashboard/src/app/api/simulate/route.ts`.
- `apps/dashboard/src/app/(auth)/sign-in/{page.tsx,visitor-entry.tsx}` (new: `visitor-entry.tsx`),
  `apps/dashboard/src/features/shell/{app-shell,passphrase-form}.tsx`,
  `apps/dashboard/src/features/shell/session-role.ts` (new),
  `apps/dashboard/src/features/policy-editor/editor/{policy-editor,yaml-editor}.tsx`.
- Tests: `apps/dashboard/test/{env,session,handler}.test.ts`, `apps/dashboard/e2e/visitor.spec.ts`
  (new), `apps/dashboard/e2e/support/fixtures.ts`, `apps/dashboard/playwright.config.ts`.
- `apps/dashboard/.env.example`, `docs/deploy.md`, `CLAUDE.md`, `docs/tasks/BACKLOG.md`.

## Decisions

- **A visitor role in the existing console**, not a curated public page. The backlog
  allowed either:
  - a separate page would duplicate the screens;
  - a role is a small change on top of the BFF's existing wrappers.
- **Off by default.** A team's own console behaves exactly as before. With access off,
  `POST /api/session/visitor` answers `404`, so it does not advertise the feature.
- **The simulator is open to visitors.** `/v1/simulate` calls the privacy service and no
  model, so a visitor spends no provider credit. The per-address budget protects the
  privacy service's CPU.
- **The policy is readable by visitors.** The audit log's rule filter and the simulator
  already show its parts. The editor stays visible but read-only, so a visitor sees how
  routing is declared.
- **Same 8-hour session and the same expiry dialog** for visitors. A visitor whose session
  ends sees the passphrase dialog; reloading the page leads to the sign-in page and its
  visitor button. A separate flow was not worth it for an 8-hour session.
- **The UI hides; the server enforces.** `useSessionRole` only changes what is shown. The
  `403` comes from `withRole` in the BFF.

## How it was verified

```bash
pnpm --filter @tamiz/dashboard exec vitest run test/session.test.ts test/handler.test.ts test/env.test.ts   # 36 passed
pnpm --filter "@tamiz/dashboard..." build
pnpm --filter @tamiz/dashboard e2e   # see the PR for the run; visitor.spec.ts covers US10-1 … US10-5
pnpm lint && pnpm typecheck && pnpm arch && pnpm test
```

`playwright.config.ts` starts a second `next start` on port 3102, from the same build,
with visitor access off. US10-1 is tested against it; the main dashboard (3100) now runs
with visitor access on.

## Pending / follow-ups

- **`T-OPS-04`** (new): sessions and limits are in memory per process (research R-03). On
  Vercel a request can reach another instance than the one that created the session. The
  user is then sent back to sign-in, operator and visitor alike. This was not visible
  locally or in Docker (one process). It needs checking on the real Vercel deployment,
  and a stateless or shared session store if it shows up.
- **Alex**: set `TAMIZ_DASHBOARD_VISITOR_ACCESS=true` in Vercel. Then link the dashboard
  from the README and the marketing drafts.

## Pitfalls for the next session

- **Per-address limits are shared state in the E2E dashboard.** Tests that count send
  their own `X-Forwarded-For`, which the E2E dashboard trusts. Browser flows without the
  header share the `unknown` bucket: keep visitor entries through the page to a few per
  run.
- **Route files may export only handlers.** That is why `sessionCookie()` moved from
  `api/session/route.ts` to `lib/server/bff.ts`.
- **The sign-in page reads `serverContext()`.** It must stay dynamic (it awaits
  `searchParams`). A static prerender would validate the environment at build time.

## Links

- Spec addendum: `specs/008-dashboard/spec.md` (User Story 10)
- Related task records: `docs/tasks/done/T-OPS-02-public-demo.md`,
  `docs/tasks/done/T-008-02-dashboard-skeleton.md` (the original sign-in and BFF)
