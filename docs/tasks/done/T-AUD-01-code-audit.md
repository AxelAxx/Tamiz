# T-AUD-01 — Code quality audit before the public showing

| Field | Value |
|---|---|
| Task | `T-AUD-01` (see `docs/tasks/BACKLOG.md`) |
| Feature | — |
| Spec | — (`docs/audit/2026-11-03-code-audit.md`) |
| Branch / PR | `T-AUD-01-code-audit` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

Alex asked for an audit before the GIFs, the LinkedIn post and his website. The whole
repository at `f4b8acd` was reviewed read-only and the result is written up in
`docs/audit/2026-11-03-code-audit.md`:

- 4 high, 21 medium and 21 low findings, each with its file and a fix task;
- nine new backlog tasks, `T-AUD-02` to `T-AUD-10`, in the order the report gives.

No code was changed.

## Files touched

- `docs/audit/2026-11-03-code-audit.md` (new): method, verdict, findings, order of fixes.
- `docs/tasks/BACKLOG.md`: section "Code audit (2026-11-03)" with `T-AUD-01` to `T-AUD-10`.
- `CLAUDE.md` §6: `docs/audit/` in the layout.

## Decisions

- **Five parallel reviews by area**, then the findings were merged into one table per
  severity. Fixes are grouped by area into PR-sized tasks, not one task per finding.
- **Published claims first.** H1 (IBAN) and H2 (agent eval) go before the circuit-breaker
  bugs. They make figures in the README overstate, and the README is what visitors
  read. Their fixes may lower a metric; the README then shows the new figure.
- **Refactors last** (`T-AUD-10`), once behaviour is fixed and covered by tests, so a
  refactor can be checked as "no behaviour change".

## How it was verified

- A mechanical sweep over every `src/` folder for `any`, `@ts-ignore`, `as unknown as`,
  `biome-ignore`, `type: ignore`, `TODO` and `FIXME`. It found:
  - three `as unknown as` (L1);
  - one justified `type: ignore`;
  - `biome-ignore` comments, each with its reason;
  - nothing else.
- Three findings were re-checked by hand:
  - **H1:** Python's `re` with `IGNORECASE`, as Presidio compiles it, gives
    `ES91 2100 0418 4502 0005 1332 300` for
    `IBAN ES91 2100 0418 4502 0005 1332 300 euros`, and the IBAN alone when a word
    follows.
  - **H2:** `agent-spend.v1.jsonl` expects `anthropic-sonnet` in 5 of 8 cases, and the
    eval's `BASELINE.targetId` is `anthropic-sonnet`.
  - **H4:** `onResult` in `circuit-breaker.ts` acts on the admission alone, without a new
    snapshot.
- The other findings rest on the reviewers' reading of the code. Each fix task starts with
  a failing test that reproduces its finding. A finding that does not reproduce is closed
  in that task's record.

## Pending / follow-ups

`T-AUD-02` to `T-AUD-10`.

## Pitfalls for the next session

- **H2 affects the README.** The agent's published 62.5 % equals the score of an agent
  that always names the baseline. Do not quote it in the LinkedIn post before
  `T-AUD-03`.
- **The detection corpus is generated** (`scripts/generate_corpus.py`). New formats go in
  the generator, never in the corpus by hand, and `--check` must pass.

## Links

- Report: `docs/audit/2026-11-03-code-audit.md`
- Related task records: `docs/tasks/done/T-OPS-06-codespaces-demo.md`
