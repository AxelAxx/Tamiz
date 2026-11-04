"""DNI, NIE and CIF recognizers (spec 004 FR-009, US2-1 … US2-5).

The patterns find candidates (case-insensitive, with the usual separators); the domain's
check-character functions decide. The look-arounds keep a candidate from starting or
ending inside a longer token, so `ABC12345678Z9` or `123456789Z` never match.
"""

from presidio_analyzer import Pattern

from privacy.domain.checksums import is_valid_cif, is_valid_dni, is_valid_nie
from privacy.infrastructure.recognizers.validated import ValidatedPatternRecognizer

# Not inside a longer token: no word character before (but `nº12345678Z` is a DNI), no dot,
# and no dash right after a digit or a dot. A slash may join two identifiers
# (`12345678Z/87654321X`), and a dash may follow a label (`DNI-12345678Z`).
_BEFORE = r"(?<![^\W\u00ba\u00aa])(?<!\.)(?<![\d.]-)"
_AFTER = r"(?![\w\-]|\.\w)"
_SEP = r"[ .\-]?"

# Eight digits, or seven for a DNI below 10,000,000 written without its zero. Only the
# seven-digit form can be the digits of a NIE or a CIF (`X 1234567 L`, `P-1658665C`), so only
# it refuses an uppercase X, Y or Z and a space before it (case-sensitively, since Presidio matches
# case-insensitively and the Spanish "y" ("and") often comes right before a DNI), and any
# letter with a dot or dash: the digits of `X-1234567-L` or of the CIF `P-1658665C`.
_DNI_DIGITS = (
    r"(?:\d{2}[ .]?\d{3}[ .]?\d{3}|(?<!(?-i:[XYZ]) )(?<![A-Z][.\-])\d[ .]?\d{3}[ .]?\d{3}"
    # K, L and M NIFs (minors, Spaniards abroad, foreigners without a NIE): mod-23 letter.
    r"|[KLM]" + _SEP + r"\d{7})"
)
DNI_REGEX = _BEFORE + _DNI_DIGITS + _SEP + r"[A-Z]" + _AFTER
NIE_REGEX = _BEFORE + r"[XYZ]" + _SEP + r"\d{7}" + _SEP + r"[A-Z]" + _AFTER
# The seven digits may be dotted like a DNI's (`B-12.345.674`).
CIF_REGEX = (
    _BEFORE + r"[ABCDEFGHJNPQRSUVW]" + _SEP + r"\d{2}\.?\d{3}\.?\d{2}" + _SEP + r"[0-9A-J]" + _AFTER
)

# Candidates are validated, so the base score only matters for explanations.
_BASE_SCORE = 0.5


def dni_recognizer() -> ValidatedPatternRecognizer:
    return ValidatedPatternRecognizer(
        "DNI",
        [Pattern("dni", DNI_REGEX, _BASE_SCORE)],
        is_valid_dni,
        context=["dni", "nif", "documento", "identidad"],
    )


def nie_recognizer() -> ValidatedPatternRecognizer:
    return ValidatedPatternRecognizer(
        "NIE",
        [Pattern("nie", NIE_REGEX, _BASE_SCORE)],
        is_valid_nie,
        context=["nie", "extranjero", "residencia", "documento"],
    )


def cif_recognizer() -> ValidatedPatternRecognizer:
    return ValidatedPatternRecognizer(
        "CIF",
        [Pattern("cif", CIF_REGEX, _BASE_SCORE)],
        is_valid_cif,
        context=["cif", "nif", "empresa", "sociedad", "factura"],
    )
