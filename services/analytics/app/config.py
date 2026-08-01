"""Service configuration, validated at startup.

Same posture as the mobile app's `src/config/env.ts`: parse and validate once,
fail loudly rather than half-working. Unlike the mobile app, this service runs
on a server, so values here **can** be genuine secrets — which is exactly why
the Google Places key was noted in Phase 9 as belonging behind a proxy like this
one rather than in the client bundle.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    #: Firebase project id. Matches the emulator project used since Phase 2.
    firebase_project_id: str = "demo-accident-black-spot-detection"

    #: Set to point at the Firestore emulator, e.g. ``127.0.0.1:8080``.
    #:
    #: When set, the Admin SDK talks to the emulator and needs no credentials at
    #: all. Every phase so far has run this way; a real service account has
    #: never been exercised.
    firestore_emulator_host: str | None = None

    #: Path to a service account JSON file, for a real project.
    #:
    #: **Never** committed and never bundled. The mobile app must not contain
    #: Admin SDK credentials — a standing project rule — which is one reason
    #: this service exists as a separate deployable at all.
    google_application_credentials: str | None = None

    #: Bearer token required by the endpoint that triggers a run.
    #:
    #: Analysis is expensive and writes to the moderation queue, so it is not
    #: something an unauthenticated caller should be able to start. Unset means
    #: the trigger endpoint refuses every request rather than allowing all of
    #: them — failing closed, matching the Firestore rules' default posture.
    analysis_api_token: str | None = None

    #: Maximum reports read in one run. Bounds memory and runtime.
    max_reports_per_run: int = Field(default=50_000, gt=0)

    @property
    def uses_emulator(self) -> bool:
        return self.firestore_emulator_host is not None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings. Cleared in tests via ``get_settings.cache_clear()``."""
    return Settings()
