# T-008-12 — Policy admin API: GET/PUT /v1/admin/policy

| Field | Value |
|---|---|
| Task | `T-008-12` (see `docs/tasks/BACKLOG.md`): the gateway half of `T-008-08` |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US5, FR-015 … FR-017) |
| Branch / PR | `T-008-12-policy-admin-api` / PR linked from the merge commit |
| Date | 2026-11-01 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The gateway can now read and replace its routing policy at runtime, for admin keys only
(spec 008 US5, `tasks.md` T034–T040). `GET /v1/admin/policy` answers the active policy
document with its source, save time, saving admin, content hash and whether saves persist
(US5-1). `PUT /v1/admin/policy` checks the body's shape, the policy id (US5-8), the
boot's cross-field rules and the configured providers (US5-3), each refusal a `400` with
every issue and its path, and refuses a stale `baseVersion` as `409 conflict` (US5-5).
A save becomes version `baseVersion + 1`, applies to the next request and simulation
(US5-4), and logs one `policy.replaced` line without the document. With `DATABASE_URL`
the versions are appended to `policy_versions` and boot uses the newest one unless the
file's version is higher (US5-7). The dashboard editor (T041–T043) is still behind gate G1
and stays in `T-008-08`.

## Files touched

- `packages/contracts/src/policy-admin.ts` (new), `src/error.ts`, `src/index.ts`:
  `ActivePolicySchema`, `ReplacePolicyRequestSchema`, `PolicyVersionMetaSchema`, the
  `conflict` error type (409) and the optional `issues` in the error envelope.
- `packages/contracts/test/policy-admin.test.ts` (new), `test/error.test.ts`: T034.
- `apps/gateway/src/domain/errors.ts`: `ConflictError` joins `DomainError`.
- `apps/gateway/src/application/ports/policy-repository.port.ts`: `PolicyVersion`,
  `PolicyReader` (read side), `getActiveVersion`, `replace`.
- `apps/gateway/src/application/policy/policy-document.ts` (new): `canonicalJson`,
  `quoteChainEntry` (moved from the file loader), `fileVersion`.
- `apps/gateway/src/application/use-cases/{get-active-policy,replace-policy}.ts` (new).
- `apps/gateway/src/application/{audit/with-audit,use-cases/cost-report,use-cases/provider-health,use-cases/route-inference}.ts`:
  depend on `PolicyReader` only.
- `apps/gateway/src/infrastructure/policy/file-policy-loader.ts`: `loadPolicyDocument`
  and `validatePolicyDocument` (shared with the stored versions).
- `apps/gateway/src/infrastructure/policy/{in-memory,postgres}-policy-repository.ts`.
- `apps/gateway/src/infrastructure/persistence/schema.ts`, `drizzle/0002_policy_versions.sql`,
  `drizzle/meta/*`: the `policy_versions` table.
- `apps/gateway/src/presentation/routes/admin/policy.ts` (new), `app.ts`,
  `openapi-schemas.ts`, `mappers/error-envelope.ts`: the routes, `ActivePolicy` and
  `ReplacePolicyRequest` components, `issues` and `conflict` in the envelope; the
  content-type check now covers `PUT`.
- `apps/gateway/src/main.ts`: database before the policy repository, boot selection,
  provider check on the chosen version, wiring.
- `apps/gateway/scripts/e2e-gateway.ts`: the policy endpoints on an in-memory repository
  (for the later Playwright flows; a reset restores the default policy).
- `apps/gateway/test/admin/policy-route.test.ts`, `test/persistence/policy-repository.test.ts`
  (new): T035, T036. `test/helpers/app.ts`, `test/policy/in-memory-policy-repository.test.ts`,
  `test/persistence/postgres.test.ts` (table list), `test/chat-completions.test.ts`,
  `test/domain/errors.test.ts`, `test/result.test.ts`: follow the new deps and error kind.
- `examples/citara-client/src/classify.ts` (+ test): `conflict` classified as
  `fix_request`; the map is exhaustive over the contract's error types.
- `packages/test-utils/src/in-memory-policy-repository.ts`: comment (it is a `PolicyReader`).
- `apps/gateway/README.md`, `specs/008-dashboard/tasks.md` (T034–T040 ticked),
  `docs/tasks/BACKLOG.md`.

## Decisions

- **The migration is `0002_policy_versions`**, not `0001` as `tasks.md` T039 said:
  `0001_audit_tools` (T-009-05) already existed. `tasks.md` is corrected.
- **`PolicyVersion` keeps the document** (`RoutingPolicyInput`, the operator's document
  without the resilience defaults filled in) next to the validated policy. `GET` answers
  the document, the content hash covers it, and PostgreSQL stores it in `document`.
  Mapping the domain policy back to a DTO would have shown defaults the operator never
  wrote.
- **Read-only use cases depend on `PolicyReader`** (`getActive` only), a supertype of the
  port. The routing, audit and report use cases need nothing more, and the
  `@tamiz/test-utils` fake still satisfies them without knowing `PolicyVersion`
  (research R-09 there).
- **The route takes the contract DTO; `main.ts` maps it** with the existing policy
  mapper (`ReplacePolicyHandler`). Presentation may not import infrastructure, and the
  application does not import contracts.
- **Issue paths are relative to the policy in the use case** and prefixed with `policy.`
  by the route, so they match the shape issues of the request schema (R-11).
- **Chain-entry issues quote the target id** (`(target "mistral-large")`), as the boot
  loader already did; the quoting moved to `application/policy/policy-document.ts`.
- **"The next simulation uses it" is tested behaviourally.** `SimulateResponse` has no
  policy version field and this task does not widen it: the test saves a different
  default chain and checks that `/v1/simulate` returns it, and that the next chat
  completion's audit entry carries the new version.
- **PostgreSQL `replace` is one `INSERT … SELECT … WHERE max(version) = base ON CONFLICT
  DO NOTHING`** with explicit casts (parameters in a select list would be typed `text`).
  Zero inserted rows → `conflict`. The active version is cached for `getActive()`;
  `GET` and a conflict refresh it, so a version saved through another gateway sharing the
  database is used after its next `GET`, a conflict or a restart.
- **Boot with a database:** stored version ≥ file version → stored; else the file is
  inserted as a `file` row and used (also on an empty table, so the history starts with
  the file). A stored document that no longer validates stops the boot with its issues.
  The provider check runs again on the chosen version.
- **`savedAt` / `savedBy` are `null` whenever the source is `file`**, also for file rows
  read back from the database.

## How it was verified

```bash
pnpm lint        # Checked 436 files. No fixes applied. Found 2 warnings. Found 91 infos. (none new)
pnpm typecheck   # all tasks successful
pnpm arch        # ✔ no dependency violations found (154 modules, 564 dependencies cruised)
pnpm test        # Test Files 133 passed (133); Tests 1378 passed | 34 skipped (1412)
pnpm build       # all tasks successful
```

`policy-route.test.ts`: 12 tests pass locally. `policy-repository.test.ts` and the
existing PostgreSQL suites are skipped locally (no Docker on this machine) and run in CI;
see the PR's `ci` log for the `policy-repository.test.ts` cases.

## Pending / follow-ups

- The dashboard half of `T-008-08` (T041–T043: YAML editor, BFF `/api/policy`, Playwright
  US5 flows) waits for gate G1. The E2E gateway already serves the policy endpoints.
- No new backlog rows.

## Pitfalls for the next session

- **No Docker here:** the Testcontainers suites only run in CI. Check the CI log, not the
  local summary, for `policy-repository.test.ts`.
- **After changing `schema.ts`, run `pnpm --filter @tamiz/gateway db:generate --name <x>`**
  and commit `drizzle/`; boot migrations read the committed files.
- **Writing files through a Bash heredoc on this machine can fail** on long TypeScript
  files ("unexpected EOF"); the Write tool is reliable.
- **`ErrorTypeSchema` is mirrored by exhaustive maps** (`examples/citara-client`
  `ERROR_CLASSES`, the contracts tests). A new error type breaks their build, by design.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (US5, research R-10, R-11, data-model 1.2,
  2.1 … 2.4, `contracts/gateway-policy.md`)
- ADRs: none added
- Related task records: `docs/tasks/done/T-002-05-policy-file.md`,
  `docs/tasks/done/T-006-03-postgres-persistence.md`,
  `docs/tasks/done/T-006-04-audit-query-api.md`
