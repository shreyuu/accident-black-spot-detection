"""FastAPI application entry point.

Run locally with:

    uv run uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.config import get_settings
from app.models.domain import ALGORITHM_VERSION
from app.utils.logging import configure_logging, get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    settings = get_settings()
    logger.info(
        "analytics service starting (algorithm %s, emulator=%s)",
        ALGORITHM_VERSION,
        settings.uses_emulator,
    )
    yield


app = FastAPI(
    title="Accident Black Spot Analytics",
    version=ALGORITHM_VERSION,
    description=(
        "Clusters approved incident reports, mines co-occurrence patterns with ECLAT, and "
        "proposes black spot candidates. Candidates are never published automatically: an "
        "administrator must review and publish each one."
    ),
    lifespan=lifespan,
)

app.include_router(router)
