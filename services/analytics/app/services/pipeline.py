"""The analysis pipeline: approved reports in, black spot candidates out.

    ingest → clean → dedupe → cluster → transactions → ECLAT → score → candidates

Pure with respect to I/O: it takes reports and returns candidates. Reading from
and writing to Firestore is the repository's job, which is what lets the whole
pipeline be tested end to end without a database.

**Nothing here publishes anything.** Every output is a *candidate* — written to
a collection the mobile app cannot read and no client can write. Turning one
into a black spot users are warned about is an administrator's deliberate,
audited act. That separation is a standing project rule and this module is the
place it would be easiest to break.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from app.algorithms.clustering import DEFAULT_EPS_M, DEFAULT_MIN_SAMPLES, cluster_reports
from app.algorithms.eclat import eclat
from app.algorithms.geo import encode_geohash
from app.algorithms.risk_score import score_cluster
from app.algorithms.transactions import build_transactions, describe_itemset
from app.models.domain import (
    ALGORITHM_VERSION,
    AnalysisJob,
    BlackSpotCandidate,
    BlackSpotCategory,
    Cluster,
    IncidentReport,
    IncidentType,
)
from app.services.cleaning import clean_reports

#: Minimum support for a pattern to be reported against a cluster.
#:
#: 0.5 — a pattern must hold in at least half the reports at a location before
#: it is shown to a moderator as characteristic of it. Lower thresholds produce
#: long lists of weak coincidences, and a moderator who learns the pattern list
#: is noise stops reading it.
DEFAULT_MIN_SUPPORT = 0.5

#: Patterns of one item are dropped: "incident type accident — in 80% of reports
#: here" restates the category rather than saying anything about co-occurrence.
MIN_PATTERN_LENGTH = 2

#: Cap on itemset size, and on how many patterns are attached to a candidate.
MAX_PATTERN_LENGTH = 3
MAX_PATTERNS_PER_CANDIDATE = 5


@dataclass(frozen=True)
class PipelineResult:
    job: AnalysisJob
    candidates: tuple[BlackSpotCandidate, ...]


def _category_for(types: Sequence[IncidentType]) -> BlackSpotCategory:
    """Choose a black spot category from the incident types at a location.

    ``mixed`` is used whenever both accident-shaped and crime-shaped incidents
    are present, rather than picking whichever is more common. A location with
    both is genuinely both, and flattening it would understate one of them to a
    user deciding whether to take that road at night.
    """
    kinds = set(types)

    has_crime = IncidentType.CRIME in kinds
    has_accident = IncidentType.ACCIDENT in kinds
    has_road_defect = bool(kinds & {IncidentType.POTHOLE, IncidentType.UNSAFE_ROAD})

    if has_crime and (has_accident or has_road_defect):
        return BlackSpotCategory.MIXED
    if has_crime:
        return BlackSpotCategory.CRIME
    if has_accident:
        return BlackSpotCategory.ACCIDENT
    if has_road_defect:
        return BlackSpotCategory.UNSAFE_ROAD
    # Only 'other' reports. Not nothing, but not classifiable either.
    return BlackSpotCategory.MIXED


def _patterns_for(reports: Sequence[IncidentReport], min_support: float) -> tuple[str, ...]:
    """Human-readable patterns ECLAT found among a cluster's reports."""
    itemsets = eclat(
        build_transactions(reports),
        min_support=min_support,
        max_length=MAX_PATTERN_LENGTH,
    )

    return tuple(
        describe_itemset(found.items, found.support)
        for found in itemsets
        if len(found.items) >= MIN_PATTERN_LENGTH
    )[:MAX_PATTERNS_PER_CANDIDATE]


def _candidate_for(
    cluster: Cluster,
    members: tuple[IncidentReport, ...],
    *,
    job_id: str,
    now: datetime,
    min_support: float,
) -> BlackSpotCandidate:
    score = score_cluster(cluster, members, now=now)

    return BlackSpotCandidate(
        # Derived from the job and the cluster, so re-running a job produces
        # stable ids rather than a fresh set of near-duplicate candidates.
        id=f"{job_id}--{cluster.id}",
        latitude=cluster.centroid_latitude,
        longitude=cluster.centroid_longitude,
        # Must match geofire-common, or the candidate is invisible to the
        # bounding-box query that would surface it. See algorithms/geo.py.
        geohash=encode_geohash(cluster.centroid_latitude, cluster.centroid_longitude),
        radius_m=cluster.radius_m,
        risk_level=score.risk_level,
        severity_score=score.score,
        score_components=score.components,
        category=_category_for(cluster.incident_types),
        report_ids=cluster.report_ids,
        report_count=cluster.report_count,
        distinct_reporters=cluster.distinct_reporters,
        patterns=_patterns_for(members, min_support),
        algorithm_version=ALGORITHM_VERSION,
        job_id=job_id,
    )


def run_pipeline(
    reports: Sequence[IncidentReport],
    *,
    now: datetime | None = None,
    job_id: str | None = None,
    eps_m: float = DEFAULT_EPS_M,
    min_samples: int = DEFAULT_MIN_SAMPLES,
    min_support: float = DEFAULT_MIN_SUPPORT,
) -> PipelineResult:
    """Run the full analysis.

    ``now`` and ``job_id`` are injectable so a run is exactly reproducible in
    tests — the same rule the mobile app's proximity engine follows.
    """
    started_at = now or datetime.now(UTC)
    resolved_job_id = job_id or f"job-{uuid.uuid4().hex[:12]}"

    cleaned = clean_reports(reports)
    clusters = cluster_reports(cleaned.reports, eps_m=eps_m, min_samples=min_samples)

    by_id = {report.id: report for report in cleaned.reports}
    candidates = tuple(
        _candidate_for(
            cluster,
            tuple(by_id[report_id] for report_id in cluster.report_ids),
            job_id=resolved_job_id,
            now=started_at,
            min_support=min_support,
        )
        for cluster in clusters
    )

    job = AnalysisJob(
        id=resolved_job_id,
        started_at=started_at,
        finished_at=datetime.now(UTC) if now is None else started_at,
        algorithm_version=ALGORITHM_VERSION,
        reports_ingested=cleaned.ingested,
        reports_after_cleaning=len(cleaned.reports),
        duplicates_removed=cleaned.duplicates_removed,
        clusters_found=len(clusters),
        candidates_written=len(candidates),
        # Every tunable that affected the result, so the run can be repeated
        # exactly even after the defaults change.
        parameters={
            "eps_m": eps_m,
            "min_samples": min_samples,
            "min_support": min_support,
            "algorithm_version": ALGORITHM_VERSION,
        },
        status="completed",
    )

    return PipelineResult(job=job, candidates=candidates)
