# T-008-09 — Dashboard container, CI E2E and accessibility sweep

| Field | Value |
|---|---|
| Task | `T-008-09` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US1-3, US1-6, US9, SC-003, SC-006) |
| Branch / PR | `T-008-09-dashboard-delivery` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The last phase of feature 008 (`tasks.md` Phase 10, T052–T056). Every `tasks.md` item of
the feature is now ticked.

- **Accessibility sweep** (T052, `e2e/sweep.spec.ts`), 28 tests. Each of the 7 screens runs
  in both themes at 1280×800 and 390×844, in three states:
  - its empty state, where it has one;
  - with data;
  - in error: a `gateway_unreachable` answer served by a browser route.

  In each state:
  - no serious or critical axe violation (US9-1);
  - at phone width, no horizontal page scroll (US9-6);
  - on desktop (dark), a keyboard walk of up to 30 Tab stops from the top of the page:
    every stop is a visible element, and focus never drops before the walk leaves the
    page (US9-2).

  `accessibility.spec.ts` keeps the per-screen checks of dialogs, menus and detail sheets.
- **The sweep found a real bug.** The phone cards of live traffic and the audit log had an
  `aria-label` ("Open details for request …") that did not start with their visible text
  (`label-content-name-mismatch`, serious). The desktop rows were fixed in `T-008-03`; the
  cards were not. The card's name is now its visible content plus a screen-reader-only
  "Open details for request …". The card also carries `data-request-id`, like the row.
- **Key-leak** (T053): the search now covers every screen, every data endpoint (including
  `GET /api/evals`) and a policy save (`PUT /api/policy`). It also asserts that the gateway
  received `/v1/admin/policy` with the admin key.
- **Container** (T054):
  - `apps/dashboard/Dockerfile`:
    - multi-stage on `node:22-alpine`;
    - the builder installs the locked workspace filtered to `@tamiz/dashboard...` and
      builds it with Turborepo;
    - the runtime holds only the standalone server, its static files and `data/evals`;
    - it runs as `node`, healthcheck `GET /api/health`.
  - `apps/dashboard/Dockerfile.dockerignore` (BuildKit reads the file next to the
    Dockerfile).
  - `docker-compose.yml` gains `dashboard`:
    - port 3100, `read_only` with a tmpfs on `/tmp`;
    - configuration from `apps/dashboard/.env.docker` with `format: raw`, so the hash's
      `$` needs no escaping;
    - `host.docker.internal` mapped to the host.
- **Start-up check** (US1-6, `e2e/config.spec.ts`): the built standalone server, with one
  variable missing and one malformed, exits with code 1. It names both and prints no value.
- **CI** (T055):
  - job `e2e`: install, build, Chromium, `pnpm --filter @tamiz/dashboard e2e`, report and
    traces uploaded on failure, timeout 15 min;
  - `docker build` of the dashboard added to `ci`.
- **Docs** (T056):
  - README status and the 008 summary;
  - `docs/architecture.md`: the browser → BFF → gateway edge and the dashboard layout;
  - `CLAUDE.md` §12: dashboard commands;
  - quickstart: the evals download is copied into the folder (only files directly in it
    are read), and the container section matches the compose file.
- `features/shell/not-built.tsx` is removed: every screen is built.

## Files touched

- `apps/dashboard/{Dockerfile,Dockerfile.dockerignore}` (new).
- `docker-compose.yml`, `.github/workflows/ci.yml`.
- `apps/dashboard/e2e/{sweep,config}.spec.ts` (new); `e2e/key-leak.spec.ts`.
- `apps/dashboard/src/features/shared/traffic-list.tsx` (phone card name);
  `src/features/shell/not-built.tsx` (deleted).
- `README.md`, `docs/architecture.md`, `CLAUDE.md`, `specs/008-dashboard/quickstart.md`.
- `specs/008-dashboard/tasks.md` (T052–T056 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **`depends_on: gateway` is not there yet.** The gateway has no service in
  `docker-compose.yml` until `T-OPS-01`. The compose comment and the quickstart point
  `TAMIZ_GATEWAY_URL` at a gateway on the host (`http://host.docker.internal:3000`).
  `T-OPS-01` adds the dependency.
- **The read-only root filesystem is set in compose** (`read_only`, tmpfs `/tmp`), not in
  the image. It was checked with `docker run --read-only --tmpfs /tmp`: healthy, user `node`,
  `/api/health` and `/sign-in` answer.
- **The image keeps the evals snapshot** and sets `TAMIZ_DASHBOARD_EVALS_DIR` to it, so the
  demo shows a real CI run without a mounted folder.
- **The error state is simulated in the browser.** A BFF `504 gateway_unreachable` is
  served by `page.route`, the same answer the BFF gives when the gateway is down. Stopping
  the shared E2E gateway would break the other tests.
- **The keyboard walk is a smoke check**: every stop is a visible element. It does not
  judge the tab order against the design; the shell's order is covered by US9-2 in
  `shell.spec.ts`.
- **The `e2e` job is not a required check yet.** Branch protection requires `ci` and
  `evals`; adding `e2e` is a repository setting for Alex.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 141 passed (141); Tests 1480 passed | 6 skipped (1486)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 107 passed (4.3 min)
docker build -f apps/dashboard/Dockerfile -t tamiz-dashboard .           # exit 0
docker run --rm tamiz-dashboard                                          # exit 1, lists the 5 missing variables
docker run --read-only --tmpfs /tmp … tamiz-dashboard                    # healthy, user=node, /api/health {"status":"ok"}
docker compose config dashboard                                          # valid (Compose v5.4.0)
```

Quickstart run: sections 1, 2 and 4 were run as above. Section 3 (by hand against a real
gateway) was covered screen by screen in each screen task's record.

## Pending / follow-ups

- Make `e2e` a required check on `main` (repository setting; Alex).
- `T-OPS-01` adds the gateway to `docker-compose.yml` and `depends_on: gateway` to the
  dashboard.

## Pitfalls for the next session

- **A `.dockerignore` at the repository root would apply to every build from the root.**
  The dashboard's lives next to its Dockerfile (`Dockerfile.dockerignore`), which BuildKit
  prefers when building with `-f`.
- **`pnpm hash-passphrase` prints `TAMIZ_DASHBOARD_PASSPHRASE_HASH=scrypt$…`**, a ready
  env-file line. Pass it with `docker run --env-file`. Inline `-e` through PowerShell or
  Bash mangles the `$`.
- **The sweep takes about two minutes** of the suite's four. If the `e2e` job nears its
  timeout, split the sweep by theme across two shards before dropping coverage.

## Links

- Spec / plan / tasks: `specs/008-dashboard/`
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-02-dashboard-skeleton.md`,
  `docs/tasks/done/T-008-10-shell-and-shared.md`, `docs/tasks/done/T-008-08-policy-editor.md`
