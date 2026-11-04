# T-AUD-13 — Recognizers on real-world layouts; offline email validation

| Field | Value |
|---|---|
| Task | `T-AUD-13` (see `docs/tasks/BACKLOG.md`) |
| Feature | `004-privacy-service`, `007-evals-gate` |
| Spec | `specs/004-privacy-service/spec.md` (FR-009 … FR-012, FR-017, research R-08) |
| Branch / PR | `T-AUD-13-recognizer-layouts` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done (bare 20-digit CCC accounts left out, see Decisions) |

## What was done

This task fixes the privacy findings of the second audit
(`docs/audit/2026-11-04-second-audit.md`). The layouts were taken from how forms, Word and
PDF text look, not from the patterns.

- **P3, Unicode separators:** the analyzer adapter maps no-break, thin, figure and
  narrow no-break spaces and the Unicode dashes to ASCII, one character for one, before
  the recognizers run. Every offset stays valid on the original text.
- **P2, IBAN layouts:** groups may be separated by a space, two spaces or a dash. An
  added pattern covers the old CCC grouping (`ES91 2100 0418 45 0200051332`).
- **DNI and CIF layouts:**
  - `nº12345678Z` and `DNI-12345678Z` are found, as are two DNIs joined by a slash.
  - K, L and M NIFs are reported as DNI, with the same mod-23 letter (P7).
  - CIFs may have dotted digits (`B-12.345.674`).
  - The seven-digit DNI form, which can be the digits of a NIE or a CIF, refuses a letter
    with a dot or a dash before it: `P-1658665C` is a CIF, not a DNI.
- **P4, phones:** two numbers joined by a slash are both found.
- **P5, email validation:** Presidio's email check uses a `tldextract` extractor that reads
  the suffix snapshot the package ships. The service no longer downloads the public
  suffix list on its first email.
- **P8, overlaps:** a checksum-validated identifier wins first, then the more sensitive
  kind, then the score. A place guessed by spaCy at 0.85 no longer hides a phone at 0.6,
  and a validated CIF still beats a guessed person.
- **P6, the corpus:** version 3 adds pasted text, plus hard negatives of nine-digit
  references that start like a phone. The CI detection dataset v3 adds the same layouts.

## Files touched

- `services/privacy/src/privacy/infrastructure/presidio_analyzer.py`: `normalised`, `OfflineEmailRecognizer`.
- `services/privacy/src/privacy/infrastructure/recognizers/{identity,banking,phone}.py`: the patterns.
- `services/privacy/src/privacy/domain/{checksums,overlap,sensitivity}.py`: K/L/M NIFs, the overlap order, `level_rank`.
- `services/privacy/scripts/generate_corpus.py`, `tests/corpus/pii-es.v3.jsonl` (v2 removed), `tests/support/corpus.py`, `tests/metrics/test_corpus_format.py`, `README.md`.
- `services/privacy/tests/recognizers/test_real_world_layouts.py` (new), `tests/unit/test_overlap.py`.
- `packages/evals/src/synthetic/{generate,identifiers}.ts`, `datasets/pii-detection-es.v3.jsonl` (v2 removed), `src/evals/detection.ts`, `test/synthetic.test.ts`, `README.md`.

## Decisions

- **Normalise, rather than widen every separator class.** One map in the adapter covers
  every recognizer, including Presidio's own and future ones. It keeps the length, so no
  offset arithmetic changes.
- **No bare 20-digit CCC.** An account number without `ES` and its check digits is a
  different kind, with a different sensitivity question. Adding it would be speculative
  (constitution X). If it is ever needed, `checksums._spanish_account_is_valid` already
  validates it.
- **Phones are not given a context requirement.** Nine-digit references that start with 6
  to 9 are reported as PHONE. Corpus precision for PHONE is now 0.9655: five false
  positives, all of them these references. Requiring a phone word would lower recall on
  bare numbers, and a false positive only makes routing more careful. The hard negatives
  make the cost visible instead of hiding it.
- **Validated identifiers first.** Putting sensitivity first alone made a guessed PERSON
  beat a checksum-validated CIF: the detection eval caught it, at 93.33 % CIF recall. A
  checksum is evidence; a statistical label is not.

## How it was verified

```bash
cd services/privacy
uv run pytest -m "not nlp" -q    # 288 passed; the new layout tests failed before the change
uv run pytest -m metrics -q      # corpus v3: every structured kind recall 1.0; PHONE precision 0.9655
uv run ruff check . ; uv run ruff format --check . ; uv run mypy ; uv run lint-imports   # clean
uv run python scripts/generate_corpus.py --check
cd ../.. && pnpm exec vitest run packages/evals   # 97 passed
TAMIZ_EVAL_PRIVACY_URL=http://127.0.0.1:8001 node packages/evals/dist/cli.js --only detection
```

The detection eval ran twice on detection v3:

- **First run:** it failed with CIF recall at 93.33 %, the overlap problem above.
- **After the fix:** every structured kind is at 100 % recall and precision, and PERSON
  recall is at 91.67 %.

The email test refuses every socket connection and checks that validation still works.

## Pending / follow-ups

- Bare CCC accounts, see Decisions. They are not added to the backlog: no use for them
  exists yet.

## Pitfalls for the next session

- **The adapter normalises; the recognizers alone do not.** Tests that call a recognizer
  directly must pass `normalised(text)`, as `test_real_world_layouts.py` does.
- **Every new DNI layout can collide with a NIE or a CIF.** After any pattern change, run
  the detection eval against a local privacy service, not just the recognizer tests.

## Links

- Audit: `docs/audit/2026-11-04-second-audit.md` (P2-P8)
- Related task records: `docs/tasks/done/T-AUD-02-recognizer-formats.md`, `docs/tasks/done/T-AUD-11-second-audit.md`
