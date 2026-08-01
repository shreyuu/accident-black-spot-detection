"""The Python vocabulary must match the TypeScript one, exactly.

``app/models/domain.py`` duplicates the string constants in
``packages/shared-types/src/vocabulary.ts``, because Python cannot import a
TypeScript module. Duplication that is not checked is duplication that drifts,
and drift here fails **silently**: a candidate written with a risk level the
mobile app does not recognise renders as nothing, and a status string that no
longer matches means a query quietly returns zero reports.

So the duplication is verified. This test parses the TypeScript source and
compares. It is deliberately a plain regex parse rather than a dependency on a
TS toolchain — the arrays it reads are simple literals, and a test that needs
Node installed to run is a test that gets skipped.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.models.domain import (
    BLACK_SPOT_RADIUS_MAX_M,
    BLACK_SPOT_RADIUS_MIN_M,
    COLLECTION_BLACK_SPOTS,
    COLLECTION_INCIDENT_REPORTS,
    BlackSpotCategory,
    BlackSpotSource,
    IncidentSeverity,
    IncidentType,
    ReportStatus,
    RiskLevel,
)

VOCABULARY_TS = (
    Path(__file__).resolve().parents[3] / "packages" / "shared-types" / "src" / "vocabulary.ts"
)


def ts_string_array(name: str) -> list[str]:
    """Read ``export const NAME = ['a', 'b'] as const;`` from the TypeScript source."""
    source = VOCABULARY_TS.read_text(encoding="utf-8")

    match = re.search(
        rf"export const {re.escape(name)}\s*=\s*\[(.*?)\]\s*as const;",
        source,
        re.DOTALL,
    )
    if match is None:
        raise AssertionError(f"{name} not found in {VOCABULARY_TS}")

    return re.findall(r"'([^']*)'", match.group(1))


class TestSourceIsReachable:
    def test_the_typescript_vocabulary_exists(self) -> None:
        """If this fails the file moved, and every other test here is vacuous."""
        assert VOCABULARY_TS.is_file(), f"expected {VOCABULARY_TS} to exist"


class TestEnumsMatch:
    @pytest.mark.parametrize(
        ("ts_name", "python_enum"),
        [
            ("RISK_LEVELS", RiskLevel),
            ("BLACK_SPOT_CATEGORIES", BlackSpotCategory),
            ("BLACK_SPOT_SOURCES", BlackSpotSource),
            ("INCIDENT_TYPES", IncidentType),
            ("INCIDENT_SEVERITIES", IncidentSeverity),
            ("REPORT_STATUSES", ReportStatus),
        ],
    )
    def test_values_match_exactly(self, ts_name: str, python_enum: type) -> None:
        assert [member.value for member in python_enum] == ts_string_array(ts_name), (
            f"{python_enum.__name__} has drifted from {ts_name} in vocabulary.ts"
        )

    def test_risk_level_order_is_preserved(self) -> None:
        """Order is meaningful — it drives alert prioritisation on the phone."""
        assert [member.value for member in RiskLevel] == ["low", "medium", "high", "critical"]

    def test_incident_severity_stays_a_three_point_scale(self) -> None:
        """Deliberately not the four-point RiskLevel.

        Keeping them separate is what stops a self-reported "high" from reading
        as an official classification.
        """
        assert len(list(IncidentSeverity)) == 3
        assert "critical" not in {member.value for member in IncidentSeverity}


class TestConstantsMatch:
    def test_radius_bounds_match(self) -> None:
        source = VOCABULARY_TS.read_text(encoding="utf-8")
        match = re.search(
            r"BLACK_SPOT_RADIUS_BOUNDS_M\s*=\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)",
            source,
        )
        assert match is not None, "BLACK_SPOT_RADIUS_BOUNDS_M not found"

        assert (
            int(match.group(1)),
            int(match.group(2)),
        ) == (BLACK_SPOT_RADIUS_MIN_M, BLACK_SPOT_RADIUS_MAX_M)

    @pytest.mark.parametrize(
        ("key", "python_value"),
        [
            ("incidentReports", COLLECTION_INCIDENT_REPORTS),
            ("blackSpots", COLLECTION_BLACK_SPOTS),
        ],
    )
    def test_collection_names_match(self, key: str, python_value: str) -> None:
        source = VOCABULARY_TS.read_text(encoding="utf-8")
        match = re.search(rf"{key}:\s*'([^']+)'", source)

        assert match is not None, f"collection {key} not found"
        assert python_value == match.group(1)
