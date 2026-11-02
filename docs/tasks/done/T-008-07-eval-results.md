# T-008-07 — Eval results screen

| Field | Value |
|---|---|
| Task | `T-008-07` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US6) |
| Branch / PR | `T-008-07-eval-results` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The evals screen shows whether the privacy and routing promises still hold (spec 008 US6,
`tasks.md` Phase 7, T044–T046, design `screens/evals.html`).

- **Reports come from a folder** (research R-09). `GET /api/evals` reads every `*.json` in
  `TAMIZ_DASHBOARD_EVALS_DIR` and parses each one with `EvalReportSchema`. It answers
  `{ reports, unreadable }`, newest run first, and never calls the gateway.
  - A missing folder counts as an empty one.
  - A file that is not a report is listed with a short issue: "is not valid JSON", or
    "does not match the report schema (at <paths>)". Its content is never quoted.
- **The run header** shows:
  - the status (word, icon and colour);
  - start time, duration, commit, policy id and version, and the file name;
  - the models and service versions, and the datasets;
  - the three headline promises: critical leak rate, structured-identifier recall and
    routing accuracy.
- **One card per eval**:
  - the gated metrics with their value, bound and pass/fail mark, plus the featured
    reported ones (saving, cost estimates);
  - the rest behind "N more reported metrics";
  - failing cases (id, reason, expected, actual) with "showing 50 of 63";
  - an `error` card shows its type and service, a `skipped` card its reason, and neither
    ever shows a pass.
  - Failing cards come first and span the row.
- **The run history** groups runs by policy version ("unknown policy" for reports without
  one). Selecting a run sets `?run=<file>`, so a reload or a shared link keeps it.
- **The unreadable notice** lists the files that could not be read, by name.
- **The empty state** names the CI artifact `evals-report`, the folder variable and the
  `gh run download` command.
- **`apps/dashboard/data/evals/`** holds the snapshot of CI run 41187796710 (2026-10-31,
  commit `9d7e22e`, policy `default` v3, all pass) for the demo.

## Files touched

- `apps/dashboard/src/lib/server/evals.ts`, `src/app/api/evals/route.ts` (new);
  `src/lib/api-client.ts` (`api.evals`).
- `apps/dashboard/src/features/eval-results/{model.ts,eval-results.tsx}` (new);
  `src/app/(console)/evals/page.tsx`.
- `apps/dashboard/data/evals/evals-report-2026-10-31.json` (new, CI artifact as downloaded).
- `apps/dashboard/test/evals-dir.test.ts` (new, T044).
- `apps/dashboard/e2e/evals.spec.ts` and `e2e/fixtures/evals.ts` (new, T045).
- `e2e/accessibility.spec.ts`: evals in both themes.
- `e2e/support/fixtures.ts`: `EVALS_DIR`, and `/api/evals` in `DATA_ENDPOINTS`, so the 401
  and key-leak sweeps cover it.
- `playwright.config.ts`: `TAMIZ_DASHBOARD_EVALS_DIR`.
- `.gitignore` (`apps/dashboard/e2e/.evals/`), `apps/dashboard/README.md` ("Eval reports").
- `specs/008-dashboard/tasks.md` (T044–T046 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **The headline figures are chosen by threshold, not by entity list.**
  - Critical leak rate: the worst of the leak metrics gated `= 0`.
  - Structured-identifier recall: the worst of the gated recall metrics with the highest
    bound.
  - Routing accuracy: `route_accuracy`.
  - Each shows the worst value and fails if any of its metrics fails. This way the
    dashboard does not repeat `thresholds.ts`.
- **The pass marks are the report's own.** The screen never compares a value with its
  bound itself. It does show one more decimal when rounding would make a missed value look
  equal to its bound (94.96 % against ≥ 95 %).
- **Reported metrics carry no mark.** The design showed "pass" next to "Saving vs
  baseline … reported". Without a threshold there is nothing to pass, so the threshold
  column says "reported" and the result column is empty (screen readers hear "not gated").
- **Metrics without a threshold sit behind a disclosure.** The real leak eval has 21
  metrics and detection has 31; only the gated ones (and the README's featured ones) stay
  in view.
- **Failing cases open by default only on a failing eval.** A passing eval can still list
  cases, for example leaks of the ungated CIF and LOCATION. Those stay closed. The list
  scrolls inside the card (`max-h-96`); the scroll region is a focusable, labelled
  `section`.
- **The history groups by policy version** (R-09). The design's flat list had a policy
  column instead. Group headings carry the policy, so the rows show status, time and
  commit.
- **E2E fixtures are typed builders** (`e2e/fixtures/evals.ts`), not JSON files as
  `tasks.md` T045 named them. They type-check against `EvalReport`, and each test writes
  what it needs into `e2e/.evals/` (git-ignored), which the dashboard reads on each request.
- **An unknown `?run=` falls back to the latest run** and says so in a status line.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 139 passed (139); Tests 1467 passed | 6 skipped (1473)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 64 passed
```

Checked by hand against `design/screenshots/evals-{failing,error-skipped}-dark-1440.png`
and `evals-default-dark-390.png`, with the CI snapshot, a failing run and an erroring run.

## Pending / follow-ups

- No new backlog rows. Adding a CI report to the demo snapshot is manual (README "Eval
  reports"); `T-OPS-01` can decide whether the stack mounts a folder instead.

## Pitfalls for the next session

- **Biome suppressions on a JSX attribute** go inside the opening tag, as a `//` comment
  right above the attribute. A `{/* biome-ignore */}` above the element is reported as
  unused.
- **The worktree guard refuses any Bash command that contains the word "eval"**, even in a
  `grep` pattern or a path (`specs/007-evals-gate`). Use the Grep and Glob tools, or
  absolute paths without compound commands.
- **`pnpm test` skipped 6 tests here, against 34 before.** The count depends on which
  Testcontainers suites find Docker; it is not a change of this task.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (research R-09)
- ADRs: none added
- Related task records: `docs/tasks/done/T-007-06-evals-ci-job.md`, `docs/tasks/done/T-008-06-cost-analytics.md`
