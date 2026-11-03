# T-AUD-02 — Recognizer formats the corpus never tried

| Field | Value |
|---|---|
| Task | `T-AUD-02` (see `docs/tasks/BACKLOG.md`) |
| Feature | `004-privacy-service`, `007-evals-gate` |
| Spec | `specs/004-privacy-service/spec.md` (FR-009, FR-010, FR-012, FR-017) |
| Branch / PR | `T-AUD-02-recognizer-formats` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The code audit (`docs/audit/2026-11-03-code-audit.md`) reported four detection gaps:

- **H1:** an IBAN followed by a number was lost;
- **M1:** 2-3-2-2 landlines and `Tel.612345678` were not found;
- **M2:** seven-digit and spaced DNIs were not found;
- **M3:** neither the corpus nor the eval dataset contained these formats, so the published
  recall could not reveal any of them.

All four are fixed, and the formats are now in the privacy corpus (v2) and in the CI
detection dataset (v2). Running that dataset uncovered a fifth problem, caused by the
seven-digit DNI fix itself: the digits of a spaced X NIE (`X 1234567 L`) also passed as a
DNI. That is fixed too.

## Files touched

- `services/privacy/src/privacy/infrastructure/recognizers/banking.py`: twelve IBAN patterns, one per length, instead of one greedy pattern.
- `services/privacy/src/privacy/infrastructure/recognizers/identity.py`: DNI with one or two leading digits and spaced groups; no DNI right after `X `/`Y `/`Z `.
- `services/privacy/src/privacy/infrastructure/recognizers/phone.py`: 2-3-2-2 landlines; a dot before the number only refused after a digit.
- `services/privacy/src/privacy/domain/checksums.py`: `is_valid_dni` accepts seven digits (leading zero implied).
- `services/privacy/tests/recognizers/*`, `tests/unit/test_checksums_identity.py`: a failing test per format first, plus the NIE cases and a seven-digit stdnum property.
- `services/privacy/scripts/generate_corpus.py`, `tests/corpus/pii-es.v2.jsonl` (v1 removed), `tests/support/corpus.py`, `tests/metrics/test_corpus_format.py`, `README.md`: corpus v2, 368 cases.
- `packages/evals/src/synthetic/{identifiers,generate,names}.ts`:
  - five detection templates;
  - `pii-detection-es.v2.jsonl` (v1 removed);
  - `pii-leak-es.v3.jsonl` (v2 removed).
- `packages/evals/src/evals/{detection,leak}.ts`, `test/synthetic.test.ts`, `README.md`: the new file names and counts.

## Decisions

- **One IBAN pattern per length, not a smarter single regex.** Presidio takes one match per
  start position and drops it when validation fails; it never tries a shorter one. Each
  country has a single IBAN length, so at most one of the twelve candidates passes the
  checksum. Overriding Presidio's `analyze` to try prefixes was the alternative. It was
  rejected because it reaches into Presidio internals that the generated patterns do not
  need.
- **Leading-zero DNIs are valid in the domain.** `is_valid_dni("1234567L")` is `True`,
  because `01234567L` is a valid DNI. `python-stdnum` rejects the short form, so the
  property test compares against `"0" + number`.
- **The NIE look-behind only covers a space.** The DNI pattern's general look-behind
  already refuses a dot or a dash before the digits, so `X.1234567.L` and `X-1234567-L`
  were never affected.
- **Leak dataset v3.** The new corpus drew the surname `Cifuentes`, which was also in the
  evals' held-out names. `synthetic.test.ts` refuses that overlap. `Cifuentes` was
  replaced by `Arrizabalaga`, which is not in Faker's `es_ES` lists. Because the
  replacement is in place, the random draws are unchanged and only those names (and their
  offsets) differ. Even so, the dataset's content changed, so its version changed too.
- **The leak dataset gets no new formats.** It measures routing given detection; the
  detection dataset measures detection. Adding the formats to detection only kept the
  leak dataset's cases comparable with earlier runs.

## How it was verified

```bash
# services/privacy
uv run pytest tests/recognizers -q        # before the fix: 13 failed; after: all passed
uv run ruff check . ; uv run ruff format --check . ; uv run mypy ; uv run lint-imports   # clean
uv run python scripts/generate_corpus.py --check ; uv run python scripts/export_openapi.py --check
uv run pytest -q                          # 285 passed
uv run pytest -m metrics -q               # corpus v2: recall and precision 1.0 for every structured kind
# packages/evals
pnpm --filter @tamiz/evals generate:datasets -- --check ; pnpm exec vitest run packages/evals   # 90 passed
TAMIZ_EVAL_PRIVACY_URL=http://localhost:8001 node packages/evals/dist/cli.js --only detection
```

The detection eval ran twice against a local privacy service:

- **First run:** it failed, with `recall.NIE` at 81.82 % and DNI precision at 92 %. This
  is the X-NIE problem described above.
- **After the fix:** it passed, with every structured kind at 100 % recall and 100 %
  precision, and `recall.PERSON` at 97.92 %.

The leak eval needs a gateway. CI's `evals` job runs it.

## Pending / follow-ups

- The README results table is generated from the `evals-report` artifact of this PR's CI
  run. It is regenerated in this same PR once that run is green.

## Pitfalls for the next session

- **Every new identifier format can collide with another kind.** A seven-digit DNI is the
  digit part of an X NIE. Run the detection eval (`--only detection`, privacy service
  alone), not just the corpus metrics: the corpus had no spaced NIE, so it could not show
  the collision.
- **`pnpm --filter @tamiz/evals generate:datasets` runs `dist/`.** Build first, or it
  writes the old datasets under the old names.
- **The evals' held-out names overlap Faker's `es_ES` lists.** About 35 of them overlap.
  Only `synthetic.test.ts` keeps them out of the privacy corpus, and a corpus change can
  draw one of them again. Replace the drawn name in `names.ts` in place, never by
  reordering the list.

## Links

- Audit: `docs/audit/2026-11-03-code-audit.md` (H1, M1-M3)
- Related task records: `docs/tasks/done/T-004-07-corpus-and-metrics.md`, `docs/tasks/done/T-007-03-leak-detection-evals.md`, `docs/tasks/done/T-AUD-01-code-audit.md`
