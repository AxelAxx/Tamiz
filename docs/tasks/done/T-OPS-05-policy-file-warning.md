# T-OPS-05 — Warn when the policy file changed without a version bump

| Field | Value |
|---|---|
| Task | `T-OPS-05` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (found in `T-009-06`; behaviour of spec 008 R-10) |
| Spec | `specs/008-dashboard/research.md` R-10 (unchanged: the stored version still wins) |
| Branch / PR | `T-OPS-05-policy-file-warning` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

With a database, boot uses the newest stored policy version when its number is at least
the file's (R-10). An edited file that keeps its version was therefore ignored with no
sign. In `T-009-06` that hid a model change for several runs.

`createPostgresPolicyRepository` now takes an optional `onFileIgnored` callback. When the
stored version wins, it looks up the stored row with the file's version number. If that
row has another content hash, the callback receives:
- the policy id;
- the file's version and content hash;
- the stored content hash;
- the active version.

`main.ts` logs this as one `warn` line, which ends "raise its version to use it". The
behaviour itself is unchanged: the stored version still wins.

## Files touched

- `apps/gateway/src/infrastructure/policy/postgres-policy-repository.ts`: `IgnoredPolicyFile`, the lookup, the callback.
- `apps/gateway/src/main.ts`: the warning.
- `apps/gateway/test/persistence/policy-repository.test.ts`: the T-OPS-05 test (Testcontainers).
- `apps/gateway/policies/README.md`: "Editing a policy file when a database is configured".
- `docs/tasks/BACKLOG.md`.

## Decisions

- **A callback, not a logger in the repository.** `main.ts` already writes the other boot
  lines ("routing policy loaded"). A plain function keeps the repository testable with no
  logger fake (constitution VIII, IX).
- **No warning when the file only falls behind a dashboard save.** File v3 unchanged plus
  stored v4 from the editor is the normal case after an edit through the dashboard. Only
  "same number, other content" is reported, which is the case the backlog row describes.
- **Warn, do not refuse to boot.** Refusing would turn a harmless leftover file edit into
  an outage. R-10 deliberately lets the stored history win.

## How it was verified

```bash
pnpm --filter @tamiz/gateway exec vitest run test/persistence/policy-repository.test.ts   # 7 passed (Docker)
pnpm lint && pnpm typecheck && pnpm arch && pnpm test   # 1497 passed, 6 skipped
```

On the compose stack, the gateway image was rebuilt and booted with a scratch copy of
`default.yaml`: still version 3, with the local model changed. The stored version 3 came
from the `T-009-06` runs. The log showed the warning before "routing policy loaded",
with `fileVersion: 3`, both hashes and `activeVersion: 3`. Afterwards the machine's
`apps/gateway/.env.docker` was restored and the stack stopped.

## Pending / follow-ups

- None.

## Pitfalls for the next session

- The in-memory repository (no `DATABASE_URL`) always uses the file, so the warning
  exists only with a database.

## Links

- Related task records: `docs/tasks/done/T-009-06-agent-demo-recording.md`,
  `docs/tasks/done/T-008-08-policy-editor.md`
