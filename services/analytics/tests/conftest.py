"""Shared fixtures and builders.

Everything here builds *valid* reports by default so each test varies only the
one thing it is about.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.domain import IncidentReport, IncidentSeverity, IncidentType, ReportStatus

#: Fixed reference time. Injected everywhere rather than read from the clock, so
#: recency scoring and de-duplication windows are exact rather than flaky.
NOW = datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC)

#: Central London, matching the seed script's default.
BASE_LAT = 51.5074
BASE_LON = -0.1278

#: Degrees of latitude per metre, near enough at this scale for building
#: fixtures a known distance apart.
_DEG_PER_M = 1.0 / 111_320.0


def offset_north(metres: float) -> float:
    """A latitude ``metres`` north of the base point."""
    return BASE_LAT + metres * _DEG_PER_M


def make_report(
    report_id: str,
    *,
    reporter_id: str = "reporter-1",
    incident_type: IncidentType = IncidentType.ACCIDENT,
    severity: IncidentSeverity = IncidentSeverity.MEDIUM,
    latitude: float | None = None,
    longitude: float | None = None,
    metres_north: float = 0.0,
    status: ReportStatus = ReportStatus.APPROVED,
    occurred_at: datetime | None = None,
    days_ago: float | None = None,
    created_at: datetime | None = None,
) -> IncidentReport:
    """Build a report, valid unless a test asks otherwise."""
    if occurred_at is None:
        occurred_at = NOW - timedelta(days=days_ago if days_ago is not None else 1.0)

    return IncidentReport(
        id=report_id,
        reporter_id=reporter_id,
        type=incident_type,
        severity=severity,
        latitude=latitude if latitude is not None else offset_north(metres_north),
        longitude=longitude if longitude is not None else BASE_LON,
        status=status,
        occurred_at=occurred_at,
        created_at=created_at if created_at is not None else occurred_at,
    )


def make_cluster_reports(
    count: int,
    *,
    reporters: int = 1,
    severity: IncidentSeverity = IncidentSeverity.MEDIUM,
    incident_type: IncidentType = IncidentType.ACCIDENT,
    spread_m: float = 20.0,
    days_ago: float = 1.0,
) -> list[IncidentReport]:
    """``count`` reports tight enough to cluster, spread over ``reporters`` people."""
    return [
        make_report(
            f"report-{index}",
            reporter_id=f"reporter-{index % reporters}",
            incident_type=incident_type,
            severity=severity,
            metres_north=(index % 3) * (spread_m / 3),
            # Staggered so same-reporter records are outside the duplicate
            # window and are not silently collapsed by cleaning.
            days_ago=days_ago + index * 2.0,
        )
        for index in range(count)
    ]
