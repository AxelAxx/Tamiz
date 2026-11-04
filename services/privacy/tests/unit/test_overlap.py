"""One finding per span (spec 004 edge cases; research R-08)."""

import itertools

from hypothesis import given
from hypothesis import strategies as st

from privacy.domain.entity_kind import EntityKind
from privacy.domain.finding import Finding
from privacy.domain.overlap import resolve_overlaps

K = EntityKind


def test_higher_score_wins() -> None:
    phone = Finding(K.PHONE, 10, 19, 0.6)
    iban = Finding(K.IBAN, 4, 33, 1.0)

    assert resolve_overlaps([phone, iban]) == (iban,)


def test_the_more_sensitive_kind_wins_over_a_higher_score() -> None:
    # Second code audit (2026-11-04, P8): a place must not hide a phone number.
    place = Finding(K.LOCATION, 0, 20, 0.85)
    phone = Finding(K.PHONE, 8, 19, 0.6)

    assert resolve_overlaps([place, phone]) == (phone,)


def test_a_checksum_validated_identifier_wins_over_a_more_sensitive_guess() -> None:
    cif = Finding(K.CIF, 15, 24, 1.0)
    person = Finding(K.PERSON, 15, 24, 0.85)

    assert resolve_overlaps([person, cif]) == (cif,)


def test_on_equal_score_the_more_specific_kind_wins() -> None:
    nss = Finding(K.NSS, 0, 12, 0.9)
    phone = Finding(K.PHONE, 3, 12, 0.9)

    assert resolve_overlaps([phone, nss]) == (nss,)


def test_on_equal_score_and_kind_the_longer_span_wins() -> None:
    short = Finding(K.PERSON, 0, 5, 0.85)
    long = Finding(K.PERSON, 0, 20, 0.85)

    assert resolve_overlaps([short, long]) == (long,)


def test_disjoint_findings_are_kept_and_sorted() -> None:
    a = Finding(K.EMAIL, 20, 30, 1.0)
    b = Finding(K.PERSON, 0, 5, 0.85)

    assert resolve_overlaps([a, b]) == (b, a)


def test_adjacent_findings_do_not_overlap() -> None:
    a = Finding(K.PERSON, 0, 5, 0.85)
    b = Finding(K.LOCATION, 5, 9, 0.85)

    assert resolve_overlaps([a, b]) == (a, b)


findings_strategy = st.lists(
    st.builds(
        lambda kind, start, length, score: Finding(kind, start, start + length, score),
        st.sampled_from(list(EntityKind)),
        st.integers(0, 60),
        st.integers(1, 15),
        st.sampled_from([0.4, 0.6, 0.85, 1.0]),
    ),
    max_size=12,
)


@given(findings_strategy)
def test_result_is_sorted_disjoint_subset_and_idempotent(findings: list[Finding]) -> None:
    result = resolve_overlaps(findings)

    assert set(result) <= set(findings)
    assert list(result) == sorted(result, key=lambda f: (f.start, f.end))
    assert all(a.end <= b.start for a, b in itertools.pairwise(result))
    assert resolve_overlaps(result) == result
    assert (len(result) == 0) == (len(findings) == 0)


@given(findings_strategy)
def test_result_does_not_depend_on_input_order(findings: list[Finding]) -> None:
    assert resolve_overlaps(findings) == resolve_overlaps(list(reversed(findings)))
