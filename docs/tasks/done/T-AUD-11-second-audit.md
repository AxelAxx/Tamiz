# T-AUD-11 — Second, verifying audit before the public showing

| Field | Value |
|---|---|
| Task | `T-AUD-11` (see `docs/tasks/BACKLOG.md`) |
| Feature | — |
| Spec | — (`docs/audit/2026-11-04-second-audit.md`) |
| Branch / PR | `T-AUD-11-second-audit` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

On 2026-11-03 Alex agreed to a second, lighter audit once the first one's fixes were in.
It is written up in `docs/audit/2026-11-04-second-audit.md`.

- It reviewed the state after `T-AUD-02` to `T-AUD-10`.
- It checked each first-audit finding, with its test.
- Three reviews looked again with fresh eyes.
- A fourth checked the repository the way an outside engineer would on a first visit.

The one high finding of the privacy review was a regression of `T-AUD-02`: no DNI right
after the word *y*. It was reproduced by hand and fixed at once in `#93`. The rest became
the backlog tasks `T-AUD-12` to `T-AUD-17`.

## Files touched

- `docs/audit/2026-11-04-second-audit.md` (new).
- `docs/tasks/BACKLOG.md`: `T-AUD-11` is done; `T-AUD-12` to `T-AUD-17` are added.

## Decisions

- **The fresh reviewers were not given the first audit.** Otherwise they would have
  confirmed its list instead of finding new problems. A separate reviewer did the
  checking, finding by finding.
- **The regression was fixed before this report.** A DNI going undetected is the kind of
  failure the project exists to prevent, so it did not wait for a fix task.
- **The README evals table goes last** (`T-AUD-17`). `T-AUD-13` changes the recognizers
  and the datasets again, so a table regenerated now would be stale within a day.

## How it was verified

- **The regression (P1):** reproduced with the real recognizer.
  `found(dni_recognizer(), "Juan y 12345678Z")` returned `[]`.
- **The first audit (46 findings):** every one was checked against the code, and the tests
  it names were run file by file. All of them passed.
- **The fresh findings:** they rest on each reviewer's reading. The privacy reviewer ran
  the real Presidio recognizers against its layouts. Each fix task starts with a failing
  test.

## Pending / follow-ups

`T-AUD-12` to `T-AUD-17`.

## Pitfalls for the next session

- **Presidio compiles every pattern case-insensitively.** A look-behind meant for an
  uppercase letter needs `(?-i:...)`, or it also matches the Spanish *y* ("and").
- **Do not trust a task record over the code.** The verification found two records that
  claimed work not done: the README table in `T-AUD-03` and the 2 s backoff in `T-AUD-07`.

## Links

- Reports: `docs/audit/2026-11-03-code-audit.md`, `docs/audit/2026-11-04-second-audit.md`
- Related task records: `docs/tasks/done/T-AUD-01-code-audit.md`
