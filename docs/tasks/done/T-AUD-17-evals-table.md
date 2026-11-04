# T-AUD-17 — Publish the evals from the final code

| Field | Value |
|---|---|
| Task | `T-AUD-17` (see `docs/tasks/BACKLOG.md`) |
| Feature | `007-evals-gate` |
| Spec | `specs/007-evals-gate/spec.md` (FR-015) · `docs/audit/2026-11-04-second-audit.md` (F1) |
| Branch / PR | `T-AUD-17-evals-table` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The README evals table and every figure quoted from it now come from one report: the
`evals-report` artifact of CI run 41825612981, on `main` at `99a9706`. That commit holds
every fix of the second audit (`T-AUD-12` to `T-AUD-15`).

- **README table:** regenerated with `pnpm evals:readme -- --report <evals.json>`. Its
  dataset line now names the files in `packages/evals/datasets/`: pii-leak-es v3,
  pii-detection-es v3, routing v1, quality-es v1 and agent-spend v2.
- **README Limitations:**
  - names are missed about 1 in 12 (recall 91.67 %), no longer 1 in 10;
  - a new bullet covers company IDs and places. The default policy rates CIF and
    LOCATION `low`, which is `allow`. The leak eval reports that 50 % of CIF values and
    25 % of locations reach a non-local provider. These rates were reported and never
    gated, and no prose mentioned them.
- **Marketing drafts:**
  - `docs/marketing/case-study.md`: the run date and commit, name recall 92 %, and a row
    for the agent eval (80 %, gate 60 %);
  - `docs/marketing/linkedin-post.md`: the source line of the figures.
- **`pnpm evals:readme -- --report …` works again.** pnpm 10 forwards the `--`, and
  `parseArgs` in strict mode refused it. The CLI drops a leading `--`, and a test covers
  that.

## Files touched

- `README.md`: the table and Limitations.
- `docs/marketing/case-study.md`, `docs/marketing/linkedin-post.md`.
- `packages/evals/src/readme-cli.ts`, `packages/evals/test/readme.test.ts`.

## Decisions

- **The CIF and location rates are documented; the policy stays as it is.** Rating a
  company ID `low` is a choice of the privacy service (`sensitivity.py`, spec 004), and
  the eval reports the rate on purpose without gating it. Changing the policy would be a
  reviewed change of its own. The README now states the trade-off and the setting that
  changes it.
- **The repository figures in the case study are not recounted** (PRs, task records,
  test counts). They are dated "2026-10-18 → 2026-11-02" and do not come from the evals
  report. `T-DOC-03` rechecks them before publishing.
- **#95 (`T-AUD-12`) and #97 (`T-AUD-14`) were closed, not merged.** #98 was built on
  both, and its squash merge carried their changes into `main`. Their records and
  backlog rows arrived the same way.

## How it was verified

```bash
gh run download 41825612981 -n evals-report   # main @ 99a9706, conclusion success
pnpm evals:readme -- --report <evals.json>   # README table updated
pnpm exec vitest run packages/evals/test/readme.test.ts   # passes, including the new `--` case
```

## Pending / follow-ups

- None for this task. `T-AUD-16` stays open as optional polish.

## Pitfalls for the next session

- **Pass the CI artifact, not a local report.** A local run uses whatever datasets and
  services the machine has, so its figures can disagree with the gate.

## Links

- Audit: `docs/audit/2026-11-04-second-audit.md` (F1)
- Related task records: `docs/tasks/done/T-AUD-03-agent-eval-baseline.md`, `docs/tasks/done/T-007-06-evals-ci-job.md`
