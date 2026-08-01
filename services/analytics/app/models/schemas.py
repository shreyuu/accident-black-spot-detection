"""Request and response shapes for the HTTP API.

Kept apart from ``domain.py`` on purpose. Domain models describe what the
pipeline works with; these describe what crosses the wire. Letting one type do
both means an internal field rename becomes a breaking API change, and it makes
it far too easy to leak a field outward that was never meant to be public.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.domain import BlackSpotCandidate, RiskLevel


class HealthResponse(BaseModel):
    status: str
    algorithm_version: str
    uses_emulator: bool


class AnalyseRequest(BaseModel):
    """Optional overrides for one run.

    Bounded rather than free: these tune a process that writes to a moderation
    queue, and a min_support of 0.001 would bury a moderator in coincidences.
    """

    eps_m: float | None = Field(default=None, gt=0, le=5000)
    min_samples: int | None = Field(default=None, ge=2, le=100)
    min_support: float | None = Field(default=None, gt=0.0, le=1.0)
    #: Run the pipeline but write nothing. The default, deliberately — see the
    #: route for why.
    dry_run: bool = True


class CandidateSummary(BaseModel):
    """A candidate as returned over HTTP.

    Deliberately omits ``report_ids``. The service holds them so a moderator can
    trace a candidate back to its evidence in Firestore, but a list of report
    ids is not something to hand out over an API, and the count conveys what a
    caller actually needs.
    """

    id: str
    latitude: float
    longitude: float
    radius_m: float
    risk_level: RiskLevel
    severity_score: int
    category: str
    report_count: int
    distinct_reporters: int
    patterns: list[str]
    score_components: dict[str, float]

    @classmethod
    def from_candidate(cls, candidate: BlackSpotCandidate) -> CandidateSummary:
        return cls(
            id=candidate.id,
            latitude=candidate.latitude,
            longitude=candidate.longitude,
            radius_m=candidate.radius_m,
            risk_level=candidate.risk_level,
            severity_score=candidate.severity_score,
            category=candidate.category.value,
            report_count=candidate.report_count,
            distinct_reporters=candidate.distinct_reporters,
            patterns=list(candidate.patterns),
            score_components=candidate.score_components,
        )


class AnalyseResponse(BaseModel):
    job_id: str
    algorithm_version: str
    started_at: datetime
    reports_ingested: int
    reports_after_cleaning: int
    duplicates_removed: int
    clusters_found: int
    #: How many candidates were **written**. Zero on a dry run, however many
    #: were found — the distinction matters to whoever triggered it.
    candidates_written: int
    dry_run: bool
    candidates: list[CandidateSummary]
    #: Restated on every response so no caller can be in any doubt.
    notice: str = (
        "Candidates are proposals only. They are not visible to app users and are never "
        "published automatically — an administrator must review and publish each one."
    )
