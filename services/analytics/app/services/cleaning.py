"""Cleaning and de-duplicating ingested reports.

Runs before clustering. Everything here is pure and deterministic: given the
same reports it produces the same output, which is what makes a published
candidate reviewable months later.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.algorithms.geo import haversine_distance_m
from app.models.domain import IncidentReport, ReportStatus

#: Two reports from the *same person* closer than this are treated as one event.
DUPLICATE_RADIUS_M = 100.0

#: ...and within this many seconds of each other.
DUPLICATE_WINDOW_S = 3600.0

#: Distance from (0, 0) inside which a position is treated as missing, in metres.
#:
#: "Null island" is where a dropped or zeroed coordinate lands. Nobody reports a
#: road incident in the Gulf of Guinea, and a cluster forming there would be
#: pure artefact.
NULL_ISLAND_RADIUS_M = 1000.0


@dataclass(frozen=True)
class CleaningResult:
    reports: tuple[IncidentReport, ...]
    ingested: int
    rejected: int
    duplicates_removed: int


def _is_usable(report: IncidentReport) -> bool:
    """Whether a report can contribute to a candidate.

    Status is re-checked even though the repository only queries approved
    reports. Validating at both boundaries is a standing project rule, and the
    consequence of getting this wrong is the one the whole moderation flow
    exists to prevent: an unapproved report influencing what users are warned
    about.
    """
    if report.status is not ReportStatus.APPROVED:
        return False

    if haversine_distance_m(0.0, 0.0, report.latitude, report.longitude) < NULL_ISLAND_RADIUS_M:
        return False

    # No usable timestamp means the report cannot be placed in time, and the
    # recency component of the risk score would have to invent one.
    return report.effective_time is not None


def _sort_key(report: IncidentReport) -> tuple[float, str]:
    """Oldest first, id as a tie-break.

    The tie-break matters: de-duplication keeps the first of a group, so without
    a total order the survivor would depend on Firestore's iteration order and
    two runs over identical data could differ.
    """
    time = report.effective_time
    return (time.timestamp() if time is not None else 0.0, report.id)


def _is_duplicate_of(candidate: IncidentReport, kept: IncidentReport) -> bool:
    """Whether ``candidate`` restates an event ``kept`` already records.

    **Only ever within one reporter.** Two different people reporting the same
    junction is not duplication — it is corroboration, and it is the strongest
    signal this service has that somewhere is genuinely dangerous. Collapsing
    those would delete the very evidence the risk score is built on, and would
    let a single prolific reporter look identical to twenty independent ones.
    """
    if candidate.reporter_id != kept.reporter_id:
        return False
    if candidate.type is not kept.type:
        return False

    candidate_time = candidate.effective_time
    kept_time = kept.effective_time
    if candidate_time is None or kept_time is None:
        return False
    if abs((candidate_time - kept_time).total_seconds()) > DUPLICATE_WINDOW_S:
        return False

    distance = haversine_distance_m(
        kept.latitude, kept.longitude, candidate.latitude, candidate.longitude
    )
    return distance <= DUPLICATE_RADIUS_M


def clean_reports(reports: Sequence[IncidentReport]) -> CleaningResult:
    """Drop unusable reports, then collapse each reporter's repeats."""
    ingested = len(reports)

    usable = sorted((report for report in reports if _is_usable(report)), key=_sort_key)
    rejected = ingested - len(usable)

    kept: list[IncidentReport] = []
    duplicates = 0
    for report in usable:
        if any(_is_duplicate_of(report, existing) for existing in kept):
            duplicates += 1
            continue
        kept.append(report)

    return CleaningResult(
        reports=tuple(kept),
        ingested=ingested,
        rejected=rejected,
        duplicates_removed=duplicates,
    )
