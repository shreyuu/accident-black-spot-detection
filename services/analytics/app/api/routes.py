"""HTTP surface.

Small on purpose. This service does one job, and every endpoint beyond the
minimum is another thing to secure.
"""

from __future__ import annotations

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.algorithms.clustering import DEFAULT_EPS_M, DEFAULT_MIN_SAMPLES
from app.config import Settings, get_settings
from app.models.domain import ALGORITHM_VERSION
from app.models.schemas import (
    AnalyseRequest,
    AnalyseResponse,
    CandidateSummary,
    HealthResponse,
)
from app.repositories.firestore import FirestoreRepository
from app.services.pipeline import DEFAULT_MIN_SUPPORT, run_pipeline
from app.utils.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def require_token(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Guard the endpoints that cost money or write data.

    Fails **closed**: with no token configured, every request is refused rather
    than every request allowed. That matches the Firestore rules' default-deny
    posture, and it means a misconfigured deployment is inert rather than open.

    Compared with ``secrets.compare_digest`` so the comparison does not leak the
    token's length or contents through timing.
    """
    expected = settings.analysis_api_token
    if expected is None or expected == "":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Analysis is not configured. Set ANALYSIS_API_TOKEN to enable it.",
        )

    supplied = ""
    if authorization is not None and authorization.startswith("Bearer "):
        supplied = authorization.removeprefix("Bearer ").strip()

    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bearer token.",
        )


@router.get("/health", response_model=HealthResponse)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Liveness, plus which algorithm version is deployed.

    Unauthenticated: it reveals nothing an operator should not be able to see,
    and a health check that needs a credential is a health check that stops
    working when the credential rotates.
    """
    return HealthResponse(
        status="ok",
        algorithm_version=ALGORITHM_VERSION,
        uses_emulator=settings.uses_emulator,
    )


@router.post(
    "/analyse",
    response_model=AnalyseResponse,
    dependencies=[Depends(require_token)],
)
def analyse(
    request: AnalyseRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalyseResponse:
    """Run the pipeline over every approved report.

    ``dry_run`` defaults to **true**, so the destructive form is the one you
    have to ask for. A run writes to the moderation queue; someone exploring the
    API should not fill it by accident.

    Nothing this endpoint can do publishes a black spot. It writes candidates,
    which an administrator must then review — restated in every response.
    """
    repository = FirestoreRepository(settings)

    reports = repository.fetch_approved_reports()

    result = run_pipeline(
        reports,
        eps_m=request.eps_m if request.eps_m is not None else DEFAULT_EPS_M,
        min_samples=(
            request.min_samples if request.min_samples is not None else DEFAULT_MIN_SAMPLES
        ),
        min_support=(
            request.min_support if request.min_support is not None else DEFAULT_MIN_SUPPORT
        ),
    )

    written = 0
    if not request.dry_run:
        written = repository.write_candidates(result.candidates)
        repository.write_job(result.job)

    logger.info(
        "analysis complete",
        extra={
            "job_id": result.job.id,
            "reports": result.job.reports_ingested,
            "clusters": result.job.clusters_found,
            "candidates": len(result.candidates),
            "written": written,
            "dry_run": request.dry_run,
        },
    )

    return AnalyseResponse(
        job_id=result.job.id,
        algorithm_version=result.job.algorithm_version,
        started_at=result.job.started_at,
        reports_ingested=result.job.reports_ingested,
        reports_after_cleaning=result.job.reports_after_cleaning,
        duplicates_removed=result.job.duplicates_removed,
        clusters_found=result.job.clusters_found,
        candidates_written=written,
        dry_run=request.dry_run,
        candidates=[CandidateSummary.from_candidate(c) for c in result.candidates],
    )


@router.get("/jobs", dependencies=[Depends(require_token)])
def jobs(settings: Annotated[Settings, Depends(get_settings)]) -> list[dict[str, Any]]:
    """Recent runs, newest first.

    Authenticated because it describes the shape of the report corpus — how many
    reports exist, how many were rejected — which is not public information.
    """
    return FirestoreRepository(settings).latest_jobs()
