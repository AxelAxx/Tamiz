# T-DOC-06 — README states two limits found in a functional check

| Field | Value |
|---|---|
| Task | `T-DOC-06` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (documentation) |
| Spec | — |
| Branch / PR | `T-DOC-06-readme-limits` / PR linked from the merge commit |
| Date | 2026-11-09 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

README "Limitations" gains two bullets:

- Tamiz inspects the request, not the model's answer.
- Health data in free text is not recognized.

## Files touched

- `README.md`, `docs/tasks/BACKLOG.md`.

## Decisions

- **Documented, not changed.** Alex decided that Tamiz stays a prototype, so neither limit
  becomes a fix task.
- **The README names the way to keep clinical text local:** the pinned `tamiz-local` rule
  of the default policy, which routes on the requested model and not on what the detector
  finds.

## How it was verified

A one-off functional check, not committed, ran the real gateway process and the real
privacy service against stand-in providers that recorded what reached them. It used the
default policy, in memory, with synthetic values. All 31 checks passed, among them:

- critical data stays local, also when the local model is down;
- names and emails reach the EU target only as placeholders, and are restored in the
  answer, also when a stream splits a placeholder;
- a request with a name does not reach a US target when the EU and local targets are down;
- with the detector down, requests stay local;
- the gateway's logs and the audit log hold none of the values.

It also observed both limits:

- a DNI in a provider's answer reached the client unchanged;
- `El paciente tiene diabetes tipo 2 y depresión mayor.`, `Frecuencia cardíaca 72 lpm, …`
  and `Historia clínica número 884213 …` were each rated `none` with the action `allow`.

`pnpm test` gave 1,536 passed and 36 skipped: the skipped ones need Docker, which was not
running, and they run in CI. `uv run pytest` in `services/privacy` gave 307 passed.

The stand-ins also replaced the local model, so this check says nothing about real
provider APIs or answer quality.

## Pending / follow-ups

- None.

## Pitfalls for the next session

- **The privacy header carries a suffix.** After anonymizing, `x-tamiz-privacy` reads
  `anonymize;notice=v1`, so compare with a prefix.

## Links

- Related task records: `docs/tasks/done/T-AUD-17-evals-table.md`, `docs/tasks/done/T-DOC-05-readme-trailer.md`
