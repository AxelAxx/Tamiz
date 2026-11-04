# T-AUD-14 — Dashboard: sign-in limiter, editor state, error messages

| Field | Value |
|---|---|
| Task | `T-AUD-14` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US1, US2, US5, US7, US10) |
| Branch / PR | `T-AUD-14-dashboard-fixes` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done (D3 documented, not changed; no Playwright test for D4) |

## What was done

This task fixes the dashboard findings of the second audit
(`docs/audit/2026-11-04-second-audit.md`).

**Sign-in:**

- **D1, the limiter:** each sign-in attempt is counted before the first `await`, and a
  success clears the count, so a concurrent burst cannot pass the check together. scrypt
  now runs asynchronously, in libuv's pool, and no longer blocks the event loop.
- **D2, the shared bucket:** `docs/deploy.md` says what an unset
  `TAMIZ_DASHBOARD_TRUST_PROXY` means. `.env.example` already did.

**The policy editor:**

- **D4, read-only mode:** CodeMirror's read-only state lives in a `Compartment` and is
  reconfigured when the role changes. A visitor who signs in as operator gets an editable
  editor in place.
- **D5, saving:** the editor is read-only while a save is in flight, and a refused save's
  issues are mapped against the text that was sent.

**Smaller fixes:**

- **D6:** reaching `/sign-in` clears the "session ended" flag.
- **D7:** clicking the chosen cost preset again resolves its range again.
- **D8:** `rate_limited`, `forbidden_role`, `forbidden_origin` and `invalid_request` get
  their own message, taken from the BFF.
- **D9:** a malformed cookie escape reads as no cookie, so the request gets a 401 instead
  of a 500.
- **D10:** live traffic updates its state ref after commit and depends on `refetch`.
- **D11:** the refactor leftovers are removed: an unused `_CARD`, an orphan comment, a
  dangling comment and a wrong header comment.
- **V-L11:** the first backoff is 2 s.

## Files touched

- Sign-in:
  - `apps/dashboard/src/lib/server/passphrase.ts`: async `verifyPassphrase`.
  - `apps/dashboard/src/app/api/session/route.ts`: the count before `await`.
- Policy editor:
  - `apps/dashboard/src/features/policy-editor/editor/yaml-editor.tsx`: the `Compartment`.
  - `apps/dashboard/src/features/policy-editor/editor/policy-editor.tsx`: read-only while saving, with the submitted text.
  - `apps/dashboard/src/features/policy-editor/editor/{conflict-dialog,policy-header}.tsx`: leftovers.
- `apps/dashboard/src/app/providers.tsx`: the expired reset.
- `apps/dashboard/src/features/cost-analytics/cost-analytics.tsx`: `resolvedAt`.
- `apps/dashboard/src/features/shared/region-states.tsx`: the error messages.
- `apps/dashboard/src/lib/server/handler.ts`: `readCookie`.
- `apps/dashboard/src/features/live-traffic/use-live-traffic.ts`: the ref, `refetch` and `backoffMs`.
- `apps/dashboard/src/features/shell/gateway-status.tsx`: a dangling comment.
- `docs/deploy.md`: the shared bucket.
- Tests:
  - `test/live-merge.test.ts`: backoff;
  - `test/handler.test.ts`: the malformed cookie;
  - `test/session.test.ts` and `test/compose-env.test.ts`: async verify;
  - `e2e/auth.spec.ts`: the concurrent burst.

## Decisions

- **Count first, clear on success.** The limiter keeps its API. An attempt is counted as
  a failure when it arrives, and a correct passphrase clears the count. The alternative,
  a "pending" state, needs a second counter for the same effect.
- **D3 (revocations in one process) is documented, not changed.** Sessions are signed
  cookies (`T-OPS-04`), so any instance accepts them, and a revocation list in one
  process is a known limit. `docs/deploy.md` already says so under "Limitations of the
  demo". A shared store would bring back the server state `T-OPS-04` removed on purpose.
- **No Playwright test for D4.** Upgrading from visitor to operator in place needs an
  expired visitor session followed by an operator sign-in in the same tab. The pieces
  exist (`visitor.spec.ts` expires a session), but the test is not written yet.
  `T-AUD-16` lists it.

## How it was verified

```bash
pnpm exec vitest run apps/dashboard        # 135 passed
pnpm --filter @tamiz/dashboard typecheck   # clean
pnpm exec biome check apps/dashboard       # no errors
```

The concurrent-burst E2E runs in the CI job `e2e`, not locally.

## Pending / follow-ups

- The Playwright test for D4 (`T-AUD-16`).

## Pitfalls for the next session

- **`verifyPassphrase` is async now.** Every caller awaits it, including the compose-env
  test.

## Links

- Audit: `docs/audit/2026-11-04-second-audit.md` (D1-D11)
- Related task records: `docs/tasks/done/T-AUD-07-dashboard-state-session.md`, `docs/tasks/done/T-OPS-04-stateless-sessions.md`
