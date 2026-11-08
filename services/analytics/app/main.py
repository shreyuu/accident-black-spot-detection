"""FastAPI application entry point.

Run locally with:

    uv run uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TypedDict

from fastapi import FastAPI

from app.api.routes import router
from app.config import Settings, get_settings
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


class DocsUrls(TypedDict):
    docs_url: str | None
    redoc_url: str | None
    openapi_url: str | None


def docs_urls(settings: Settings) -> DocsUrls:
    """Where the interactive docs and schema are served — only on the emulator.

    The OpenAPI schema is an unauthenticated map of every endpoint and
    parameter. Useful while developing; a deployment has no reader for it.
    """
    if settings.uses_emulator:
        return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
    return {"docs_url": None, "redoc_url": None, "openapi_url": None}


_DOCS = docs_urls(get_settings())

app = FastAPI(
    title="Accident Black Spot Analytics",
    version=ALGORITHM_VERSION,
    description=(
        "Clusters approved incident reports, mines co-occurrence patterns with ECLAT, and "
        "proposes black spot candidates. Candidates are never published automatically: an "
        "administrator must review and publish each one."
    ),
    lifespan=lifespan,
    docs_url=_DOCS["docs_url"],
    redoc_url=_DOCS["redoc_url"],
    openapi_url=_DOCS["openapi_url"],
)

app.include_router(router)
