"""IBAN recognizer (spec 004 FR-010, US2-6).

Candidates are the country code, check digits and groups of four (spaced or compact).
After the first group (which may hold a bank code in letters, as in GB or NL) only digit
groups follow, so a word right after the IBAN is never swallowed into the candidate. IBANs
with letters later in the BBAN (some FR, IT accounts) are therefore not found: an accepted
miss, measured by the corpus.

A number may follow the IBAN (`… 1332 300 euros`), and one greedy pattern would take it in,
fail the checksum and lose the IBAN: Presidio never retries a shorter match. So there is
one pattern per length, from one to six groups of four, with or without a short last group.
At most one of them passes the checksum, because each country has a single IBAN length.
"""

from presidio_analyzer import Pattern

from privacy.domain.checksums import is_valid_iban
from privacy.infrastructure.recognizers.validated import ValidatedPatternRecognizer

# Groups are separated by a space, two spaces or a dash (audit 2026-11-04, P2).
_SEP = r"(?:[ \-]|  )?"
_HEAD = r"(?<!\w)[A-Z]{2}\d{2}" + _SEP + r"[A-Z0-9]{4}"
_TAIL = r"(?:" + _SEP + r"\d{1,3})"
IBAN_REGEXES = [
    _HEAD + r"(?:" + _SEP + r"\d{4}){" + str(groups) + "}" + tail + r"(?!\w)"
    for groups in range(1, 7)
    for tail in ("", _TAIL)
] + [
    # A Spanish IBAN in the old CCC grouping: bank, branch, control digits, account.
    r"(?<!\w)ES\d{2}" + _SEP + r"\d{4}" + _SEP + r"\d{4}" + _SEP + r"\d{2}" + _SEP + r"\d{10}(?!\w)"
]


def iban_recognizer() -> ValidatedPatternRecognizer:
    return ValidatedPatternRecognizer(
        "IBAN",
        [Pattern(f"iban_{i}", regex, 0.5) for i, regex in enumerate(IBAN_REGEXES)],
        is_valid_iban,
        context=["iban", "cuenta", "transferencia", "domiciliación", "banco"],
    )
