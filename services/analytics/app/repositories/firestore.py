"""Firestore access for the analytics service.

The only module that talks to a database. Everything else takes and returns
domain objects, which is what lets the pipeline and all the algorithms be tested
without one.

This service uses the **Admin SDK**, which bypasses security rules entirely.
That is appropriate for a trusted server-side process and is precisely why it
must never run in the mobile app — a standing project rule. The compensating
control is that this module can write to exactly two collections, neither of
which is one users read.
"""

from __future__ import annotations

import os
from collections.abc import Iterator, Sequence
from datetime import UTC, datetime
from typing import Any

import firebase_admin
import google.auth.credentials
from firebase_admin import credentials, firestore

from app.config import Settings
from app.models.domain import (
    COLLECTION_ANALYSIS_JOBS,
    COLLECTION_BLACK_SPOT_CANDIDATES,
    COLLECTION_INCIDENT_REPORTS,
    AnalysisJob,
    BlackSpotCandidate,
    IncidentReport,
    ReportStatus,
)

#: Firestore's limit on operations in a single batched write.
_BATCH_LIMIT = 500


# `credentials.Base` is untyped (the SDK ships no stubs — see pyproject), so
# mypy sees it as `Any` and strict mode rejects subclassing it. Acknowledged
# here rather than by relaxing strictness across the whole module.
class _EmulatorCredentials(credentials.Base):  # type: ignore[misc]
    """A credential that authenticates with nothing, for the emulator.

    ``firebase_admin.credentials`` offers ``Certificate``, ``ApplicationDefault``
    and ``RefreshToken`` — and **no anonymous option**. Passing ``None`` does not
    mean "no credentials"; it makes the SDK fall back to Application Default
    Credentials, which then fails with ``DefaultCredentialsError`` on any machine
    without a gcloud login. That is exactly what happened the first time this ran
    against the emulator, and the error names ADC rather than the emulator, so it
    is a genuinely confusing failure to diagnose.

    ``credentials.Base`` exists to be subclassed for this, and
    ``google.auth.credentials.AnonymousCredentials`` is the standard object for
    "a transport that needs no token". The emulator ignores auth entirely.
    """

    def get_credential(self) -> google.auth.credentials.Credentials:
        # Untyped in google-auth, for the same reason as above.
        return google.auth.credentials.AnonymousCredentials()  # type: ignore[no-untyped-call]


def initialise_firebase(settings: Settings) -> None:
    """Initialise the Admin SDK once per process.

    The emulator path needs no real credentials — setting
    ``FIRESTORE_EMULATOR_HOST`` is what redirects the SDK — so it is checked
    first. That keeps every phase's "emulators only, no real project" posture
    working with no service account anywhere on disk.
    """
    # `_apps` is private, but the SDK exposes no public way to ask whether it
    # has already been initialised, and initialising twice raises.
    if firebase_admin._apps:
        return

    if settings.firestore_emulator_host is not None:
        os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host
        firebase_admin.initialize_app(
            _EmulatorCredentials(), {"projectId": settings.firebase_project_id}
        )
        return

    if settings.google_application_credentials is not None:
        certificate = credentials.Certificate(settings.google_application_credentials)
        firebase_admin.initialize_app(certificate, {"projectId": settings.firebase_project_id})
        return

    # Application Default Credentials — the deployed path. Untested against a
    # real project; see the service README.
    firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})


def _to_datetime(value: Any) -> datetime | None:
    """Normalise whatever Firestore returned into an aware datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    # DatetimeWithNanoseconds and friends expose .timestamp().
    timestamp = getattr(value, "timestamp", None)
    if callable(timestamp):
        try:
            return datetime.fromtimestamp(timestamp(), tz=UTC)
        except (OSError, OverflowError, ValueError):
            return None
    return None


def document_to_report(document_id: str, data: dict[str, Any]) -> IncidentReport | None:
    """Convert a Firestore document into a domain report.

    Returns ``None`` for anything that cannot be trusted rather than raising.
    One malformed document among thousands must not abort a run — and a document
    predating a schema change, or written by an older client, is a normal thing
    to encounter.

    Exported and pure, so the awkward cases are unit-testable without a database.
    """
    try:
        latitude = data.get("latitude")
        longitude = data.get("longitude")
        if not isinstance(latitude, int | float) or not isinstance(longitude, int | float):
            return None

        return IncidentReport(
            id=document_id,
            reporter_id=str(data.get("reporterId", "")),
            type=data["type"],
            severity=data["severity"],
            latitude=float(latitude),
            longitude=float(longitude),
            status=data.get("status", ReportStatus.PENDING),
            occurred_at=_to_datetime(data.get("occurredAt")),
            created_at=_to_datetime(data.get("createdAt")),
        )
    except (KeyError, ValueError, TypeError):
        return None


class FirestoreRepository:
    """Reads approved reports; writes candidates and job records."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        initialise_firebase(settings)
        self._client = firestore.client()

    # -- reads ---------------------------------------------------------------

    def fetch_approved_reports(self) -> list[IncidentReport]:
        """Every approved report, up to the configured cap.

        Filtered server-side on ``status == 'approved'``. The pipeline checks it
        again — validating at both boundaries — because the consequence of an
        unapproved report reaching a candidate is the failure the whole
        moderation flow exists to prevent.
        """
        query = (
            self._client.collection(COLLECTION_INCIDENT_REPORTS)
            .where(filter=firestore.FieldFilter("status", "==", ReportStatus.APPROVED.value))
            .limit(self._settings.max_reports_per_run)
        )

        reports: list[IncidentReport] = []
        for document in query.stream():
            data = document.to_dict()
            if data is None:
                continue
            report = document_to_report(document.id, data)
            if report is not None:
                reports.append(report)

        return reports

    # -- writes --------------------------------------------------------------

    def write_candidates(self, candidates: Sequence[BlackSpotCandidate]) -> int:
        """Write candidates to ``blackSpotCandidates``.

        **Never** to ``blackSpots``. Publishing is an administrator's act, and
        this service is not able to perform it — the collection it writes to is
        one the mobile app cannot read.

        Ids are deterministic (``job--cluster``), so ``set`` is used rather than
        ``add``: re-running a job overwrites its own candidates instead of
        piling up near-duplicates in the moderation queue.
        """
        written = 0
        for chunk in _chunked(candidates, _BATCH_LIMIT):
            batch = self._client.batch()
            for candidate in chunk:
                reference = self._client.collection(COLLECTION_BLACK_SPOT_CANDIDATES).document(
                    candidate.id
                )
                batch.set(reference, _candidate_to_document(candidate))
                written += 1
            batch.commit()
        return written

    def write_job(self, job: AnalysisJob) -> None:
        """Record the run's metadata."""
        self._client.collection(COLLECTION_ANALYSIS_JOBS).document(job.id).set(
            {
                "id": job.id,
                "startedAt": job.started_at,
                "finishedAt": job.finished_at,
                "algorithmVersion": job.algorithm_version,
                "reportsIngested": job.reports_ingested,
                "reportsAfterCleaning": job.reports_after_cleaning,
                "duplicatesRemoved": job.duplicates_removed,
                "clustersFound": job.clusters_found,
                "candidatesWritten": job.candidates_written,
                "parameters": job.parameters,
                "status": job.status,
                "error": job.error,
            }
        )

    def latest_jobs(self, limit: int = 20) -> list[dict[str, Any]]:
        """Recent job records, newest first."""
        query = (
            self._client.collection(COLLECTION_ANALYSIS_JOBS)
            .order_by("startedAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        return [document.to_dict() or {} for document in query.stream()]


def _candidate_to_document(candidate: BlackSpotCandidate) -> dict[str, Any]:
    """Serialise a candidate for Firestore.

    Field names are camelCase to match every other collection in this project,
    which the dashboard reads directly.

    Note what is **absent**: no ``verified`` field and no ``active`` field. Those
    belong to ``blackSpots`` and are what the mobile app's query requires. A
    candidate carrying them would be one copy operation away from being visible
    to users; without them it cannot satisfy the app's query even by accident.
    """
    return {
        "id": candidate.id,
        "latitude": candidate.latitude,
        "longitude": candidate.longitude,
        "geohash": candidate.geohash,
        "radiusM": candidate.radius_m,
        "riskLevel": candidate.risk_level.value,
        "severityScore": candidate.severity_score,
        "scoreComponents": candidate.score_components,
        "category": candidate.category.value,
        "source": candidate.source.value,
        "reportIds": list(candidate.report_ids),
        "reportCount": candidate.report_count,
        "distinctReporters": candidate.distinct_reporters,
        "patterns": list(candidate.patterns),
        "algorithmVersion": candidate.algorithm_version,
        "jobId": candidate.job_id,
        "status": "proposed",
        "createdAt": firestore.SERVER_TIMESTAMP,
    }


def _chunked(items: Sequence[Any], size: int) -> Iterator[Sequence[Any]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]
