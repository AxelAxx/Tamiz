"""Layouts people actually paste (second code audit, 2026-11-04, P2-P4, P7).

Written from how Spanish forms, Word and PDF text look, not from the patterns: no-break
spaces, Unicode dashes, the old CCC grouping of an IBAN, two numbers joined by a slash.
The analyzer adapter maps Unicode spaces and dashes to ASCII one-to-one before the
recognizers run; `normalised` does the same here.
"""

import pytest
from presidio_analyzer import EntityRecognizer

from privacy.infrastructure.presidio_analyzer import OfflineEmailRecognizer, normalised
from privacy.infrastructure.recognizers.banking import iban_recognizer
from privacy.infrastructure.recognizers.identity import cif_recognizer, dni_recognizer
from privacy.infrastructure.recognizers.phone import phone_recognizer
from tests.support.recognizers import found


def values(recognizer: EntityRecognizer, text: str) -> list[str]:
    return [value for _, value, _ in found(recognizer, normalised(text))]


@pytest.mark.parametrize(
    ("text", "iban"),
    [
        ("Cuenta ES91 2100 0418 45 0200051332 para la nómina", "ES91 2100 0418 45 0200051332"),
        ("IBAN ES91-2100-0418-4502-0005-1332.", "ES91-2100-0418-4502-0005-1332"),
        ("IBAN ES91  2100 0418 4502 0005 1332.", "ES91  2100 0418 4502 0005 1332"),
        (
            "IBAN ES91\u00a02100\u00a00418\u00a04502\u00a00005\u00a01332.",
            "ES91 2100 0418 4502 0005 1332",
        ),
    ],
)
def test_iban_layouts(text: str, iban: str) -> None:
    assert values(iban_recognizer(), text) == [iban]


@pytest.mark.parametrize(
    ("text", "dni"),
    [
        ("DNI nº12345678Z", "12345678Z"),
        ("DNI-12345678Z", "12345678Z"),
        ("con DNI 12345678\u2011Z", "12345678-Z"),
        ("DNI 12345678Z/87654321X", "12345678Z"),
        ("NIF K1234567L del menor", "K1234567L"),
    ],
)
def test_dni_layouts(text: str, dni: str) -> None:
    assert dni in values(dni_recognizer(), text)


def test_two_dnis_joined_by_a_slash_are_both_found() -> None:
    assert values(dni_recognizer(), "DNI 12345678Z/87654321X") == ["12345678Z", "87654321X"]


def test_cif_with_dotted_digits() -> None:
    assert values(cif_recognizer(), "Empresa con CIF B-12.345.674") == ["B-12.345.674"]


@pytest.mark.parametrize(
    ("text", "phones"),
    [
        ("teléfono 612345678/612345679", ["612345678", "612345679"]),
        ("tel\u00a0612\u00a0345\u00a0678", ["612 345 678"]),
    ],
)
def test_phone_layouts(text: str, phones: list[str]) -> None:
    assert values(phone_recognizer(), text) == phones


def test_email_validation_never_calls_out(monkeypatch: pytest.MonkeyPatch) -> None:
    # Second code audit (P5): the public suffix list comes from the package, not the network.
    import socket

    def refuse(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("the privacy service must not open a connection")

    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket.socket, "connect", refuse)
    recognizer = OfflineEmailRecognizer(supported_language="es")

    assert recognizer.validate_result("ana.ruiz@example.org") is True
    assert recognizer.validate_result("ana.ruiz@localhost") is False


def test_the_digits_of_a_dashed_cif_are_not_also_a_dni() -> None:
    # 1658665C happens to carry a valid DNI letter; as part of P-1658665C it is a CIF.
    assert values(dni_recognizer(), "la empresa con CIF P-1658665C y don Juan") == []
    assert values(cif_recognizer(), "la empresa con CIF P-1658665C y don Juan") == ["P-1658665C"]
