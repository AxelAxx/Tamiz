# T-OPS-04 — Dashboard sessions that survive serverless instances

| Field | Value |
|---|---|
| Task | `T-OPS-04` (see `docs/tasks/BACKLOG.md`) |
| Feature | 008 (research R-03 amendment; FR-026 reworded) |
| Spec | `specs/008-dashboard/research.md` R-03 "Amendment (2026-11-02)"; `data-model.md` §3.1 |
| Branch / PR | `T-OPS-04-stateless-sessions` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

Sessions were ids in an in-memory map (research R-03). On Vercel (`T-OPS-02`), requests
spread over serverless instances that do not share memory and are recycled, so a
signed-in operator or visitor would have been sent back to sign-in at random.

- **The session is now a signed cookie**: `<nonce>.<role>.<expiresAt>.<HMAC-SHA-256>`.
  - `session-cookie.ts`: `signSession` and `verifySessionCookie`. Verification returns
    the claims. It refuses:
    - a payload that is not exactly nonce, role and epoch ms;
    - an unknown role;
    - a bad signature, in constant time.
  - Any process with `TAMIZ_DASHBOARD_SESSION_SECRET` accepts the cookie, and a restart
    no longer signs anyone out.
- **The store keeps only sign-out revocations**: `nonce → expiresAt`, in memory, swept
  after expiry. Its interface (`create`, `isValid`, `roleOf`, `revoke`, `sweep`) is
  unchanged, so no route or wrapper changed.
- **`proxy.ts`** now also checks the expiry, so an expired cookie lands on
  `/sign-in?session=expired` instead of loading a page whose data calls fail.
- **Spec**: the research R-03 amendment (decision, the weaker sign-out guarantee,
  alternatives rejected), FR-026 reworded (the role travels signed in the cookie), and
  data-model §3.1 updated.
- **Docs**: `docs/deploy.md` (the sign-out limit on Vercel and how to end every session),
  `apps/dashboard/README.md`.

## Files touched

- `apps/dashboard/src/lib/server/{session-cookie,session}.ts`, `apps/dashboard/src/proxy.ts`.
- `apps/dashboard/test/session.test.ts`, `apps/dashboard/e2e/sessions.spec.ts` (new).
- `specs/008-dashboard/{research,spec,data-model}.md`, `docs/deploy.md`,
  `apps/dashboard/README.md`, `docs/tasks/BACKLOG.md`.

## Decisions

- **Stateless signed cookies, not a shared store.** A Valkey reachable from Vercel would
  mean publishing the store or paying for a hosted one, for one console. The cost of the
  stateless design is stated in R-03 and `docs/deploy.md`:
  - sign-out clears the cookie;
  - a copy made before then is refused only by the process that handled the sign-out;
  - other instances accept the copy until it expires (at most 8 hours);
  - rotating the session secret ends every session.

  In Docker and `next start` there is one process, so US1-4 holds fully.
- **Rate limits stay per process.** This was already documented in `T-OPS-03` ("per
  serverless instance").
- **Old cookies** (`id.signature`) fail the new format and lead to the sign-in page once.

## How it was verified

```bash
pnpm --filter @tamiz/dashboard exec vitest run   # 126 passed (session cookie format, forgery, cross-process, revocation, sweep)
pnpm --filter "@tamiz/dashboard..." build && pnpm --filter @tamiz/dashboard e2e
pnpm lint && pnpm typecheck && pnpm arch && pnpm test
```

`e2e/sessions.spec.ts` uses the two dashboard processes of the E2E run (ports 3100 and
3102, same build and secret) as two instances. It checks two things:
- a session made by one is accepted by the other;
- after sign-out, a copied cookie is refused by the process that signed it out and
  accepted by the other. This pins the documented limit, so a change to it is a visible
  test change.

Not verified here: the real Vercel deployment. It does not exist yet (`T-OPS-02`, Alex's
steps).

## Pending / follow-ups

- None in the repository. On the first Vercel deploy, check that navigating between
  screens for a few minutes never returns to sign-in (`docs/deploy.md` step 5).

## Pitfalls for the next session

- **A cookie is shared by both E2E dashboards.** Cookies are not port-bound, so a cookie
  set by `localhost:3100` is sent to `localhost:3102` too. `sessions.spec.ts` relies on
  this; another test that signs in on one and expects to be signed out on the other would
  not.
- **Never put anything secret in the cookie payload.** It is signed, not encrypted: the
  role and expiry are readable by the browser's owner.

## Links

- Related task records: `docs/tasks/done/T-OPS-03-public-readonly-demo.md`,
  `docs/tasks/done/T-OPS-02-public-demo.md`, `docs/tasks/done/T-008-02-dashboard-skeleton.md`
