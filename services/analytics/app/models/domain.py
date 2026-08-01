"""Domain vocabulary and models for the analytics service.

The string constants here are a **mirror** of
``packages/shared-types/src/vocabulary.ts``. They are duplicated rather than
imported because there is no sane way for Python to read a TypeScript module,
and a duplicated constant that drifts is exactly the failure this project has
been avoiding since Phase 7 — a candidate written with a risk level the mobile
app renders as nothing.

The duplication is therefore **tested**: ``tests/test_vocabulary_mirror.py``
parses the TypeScript source and asserts these lists match it exactly, so drift
fails the build instead of failing silently in production.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

# -----------------------------------------------------------------------------
# Mirrored vocabulary
# -----------------------------------------------------------------------------


class RiskLevel(StrEnum):
    """Ordered low → critical. Order is meaningful and must not be changed."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class BlackSpotCategory(StrEnum):
    ACCIDENT = "accident"
    CRIME = "crime"
    MIXED = "mixed"
    UNSAFE_ROAD = "unsafe-road"


class BlackSpotSource(StrEnum):
    MANUAL = "manual"
    REPORTS = "reports"
    ALGORITHM = "algorithm"
    OFFICIAL = "official"


class IncidentType(StrEnum):
    ACCIDENT = "accident"
    CRIME = "crime"
    POTHOLE = "pothole"
    UNSAFE_ROAD = "unsafe-road"
    OTHER = "other"


class IncidentSeverity(StrEnum):
    """Reporter-assessed, three-point. Deliberately not the four-point RiskLevel.

    A member of the public is judging one event they witnessed; a black spot's
    risk level is a moderated, aggregated judgement. Keeping the vocabularies
    separate is what stops a self-reported "high" from ever reading as an
    official classification.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ReportStatus(StrEnum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# Collection names, mirrored from COLLECTIONS in vocabulary.ts plus the two this
# phase introduces.
COLLECTION_INCIDENT_REPORTS = "incidentReports"
COLLECTION_BLACK_SPOTS = "blackSpots"
COLLECTION_BLACK_SPOT_CANDIDATES = "blackSpotCandidates"
COLLECTION_ANALYSIS_JOBS = "analysisJobs"

# Mirrored from BLACK_SPOT_RADIUS_BOUNDS_M.
BLACK_SPOT_RADIUS_MIN_M = 50
BLACK_SPOT_RADIUS_MAX_M = 5000


# -----------------------------------------------------------------------------
# Algorithm versioning
# -----------------------------------------------------------------------------

#: Bumped whenever a change alters the output for unchanged input.
#:
#: Written onto every candidate and every job. Without it, a candidate found in
#: the moderation queue is unreproducible: there is no way to tell which version
#: of the scoring produced a 72, and therefore no way to review the decision or
#: to re-run it. Treat this the way a schema version is treated.
ALGORITHM_VERSION = "1.0.0"


# -----------------------------------------------------------------------------
# Ingested data
# -----------------------------------------------------------------------------


class IncidentReport(BaseModel):
    """An approved report, as read from Firestore.

    A deliberate subset of the mobile app's ``IncidentReport``. The description
    text, the photograph URLs and the moderation notes are **not** read: this
    service clusters positions and categories, and pulling free text and images
    it has no use for into an analytics pipeline would be collecting more
    personal data than the job needs.

    ``reporter_id`` is read, but only to count *distinct reporters* per cluster —
    see ``risk_score``. It never leaves the service.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    reporter_id: str
    type: IncidentType
    severity: IncidentSeverity
    latitude: float
    longitude: float
    status: ReportStatus
    #: When the incident happened, when the reporter said. Falls back to
    #: ``created_at`` in the pipeline, never silently to "now".
    occurred_at: datetime | None = None
    created_at: datetime | None = None

    @field_validator("latitude")
    @classmethod
    def _valid_latitude(cls, value: float) -> float:
        if not -90.0 <= value <= 90.0:
            raise ValueError(f"latitude out of range: {value}")
        return value

    @field_validator("longitude")
    @classmethod
    def _valid_longitude(cls, value: float) -> float:
        if not -180.0 <= value <= 180.0:
            raise ValueError(f"longitude out of range: {value}")
        return value

    @property
    def effective_time(self) -> datetime | None:
        """When the incident happened, as best as it is known."""
        return self.occurred_at or self.created_at


# -----------------------------------------------------------------------------
# Pipeline output
# -----------------------------------------------------------------------------


class Cluster(BaseModel):
    """A group of nearby reports, produced by DBSCAN."""

    model_config = ConfigDict(frozen=True)

    id: str
    centroid_latitude: float
    centroid_longitude: float
    #: Radius covering every member, floored at the minimum sane black spot size.
    radius_m: float
    report_ids: tuple[str, ...]
    #: How many *distinct* people reported here. See risk_score for why.
    distinct_reporters: int
    incident_types: tuple[IncidentType, ...]
    severities: tuple[IncidentSeverity, ...]

    @property
    def report_count(self) -> int:
        return len(self.report_ids)


class FrequentItemset(BaseModel):
    """One frequent itemset, as produced by ECLAT."""

    model_config = ConfigDict(frozen=True)

    items: tuple[str, ...]
    #: Number of transactions containing every item.
    support_count: int
    #: ``support_count / transaction_count``, in [0, 1].
    support: float


class RiskScore(BaseModel):
    """A cluster's score, with the components that produced it.

    The breakdown is stored, not just the total. A moderator being asked to
    publish a hazard on an algorithm's say-so is entitled to see why it scored
    what it did, and "72" on its own is not a reason.
    """

    model_config = ConfigDict(frozen=True)

    score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    components: dict[str, float]


class BlackSpotCandidate(BaseModel):
    """A proposed black spot. **Never** a published one.

    Written to ``blackSpotCandidates``, which the mobile app cannot read and no
    client can write. Publishing means an administrator creating a document in
    ``blackSpots`` — a separate, deliberate, audited act. That separation is a
    standing project rule: an algorithm must not be able to put a warning in
    front of users on its own.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    latitude: float
    longitude: float
    geohash: str
    radius_m: float
    risk_level: RiskLevel
    severity_score: int = Field(ge=0, le=100)
    score_components: dict[str, float]
    category: BlackSpotCategory
    #: Always ``algorithm``. A candidate has exactly one provenance.
    source: BlackSpotSource = BlackSpotSource.ALGORITHM
    report_ids: tuple[str, ...]
    report_count: int
    distinct_reporters: int
    #: Human-readable patterns ECLAT found in this cluster.
    patterns: tuple[str, ...]
    algorithm_version: str = ALGORITHM_VERSION
    job_id: str


class AnalysisJob(BaseModel):
    """Metadata for one pipeline run.

    Recorded so a run is auditable and repeatable: which inputs, which
    parameters, which algorithm version, and what came out.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    started_at: datetime
    finished_at: datetime | None = None
    algorithm_version: str = ALGORITHM_VERSION
    reports_ingested: int = 0
    reports_after_cleaning: int = 0
    duplicates_removed: int = 0
    clusters_found: int = 0
    candidates_written: int = 0
    #: Every tunable that affected the result, so a run can be reproduced.
    parameters: dict[str, float | int | str] = Field(default_factory=dict)
    status: str = "running"
    error: str | None = None
