"""One finding per span (research R-08). In order, the winner is:

1. a checksum-validated identifier (score 1.0) over a statistical or structural guess;
2. the more sensitive kind, so a spaCy place scored 0.85 never hides a phone number scored
   0.6 in the same span (second code audit, 2026-11-04, P8);
3. the higher score, then the more specific kind, then the longer span.
"""

from collections.abc import Sequence

from privacy.domain.entity_kind import SPECIFICITY
from privacy.domain.finding import Finding
from privacy.domain.sensitivity import LEVEL_BY_KIND, level_rank

_SPECIFICITY_RANK = {kind: rank for rank, kind in enumerate(SPECIFICITY)}
_VALIDATED = 1.0


def _priority(f: Finding) -> tuple[bool, int, float, int, int, int]:
    # Larger is better; the start offset makes the order total (deterministic results).
    return (
        f.score >= _VALIDATED,
        level_rank(LEVEL_BY_KIND[f.kind]),
        f.score,
        -_SPECIFICITY_RANK[f.kind],
        f.length,
        -f.start,
    )


def resolve_overlaps(findings: Sequence[Finding]) -> tuple[Finding, ...]:
    kept: list[Finding] = []
    for candidate in sorted(set(findings), key=_priority, reverse=True):
        if not any(candidate.overlaps(k) for k in kept):
            kept.append(candidate)
    return tuple(sorted(kept, key=lambda f: (f.start, f.end)))
