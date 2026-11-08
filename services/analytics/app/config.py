"""Service configuration, validated at startup.

Same posture as the mobile app's `src/config/env.ts`: parse and validate once,
fail loudly rather than half-working. Unlike the mobile app, this service runs
on a server, so values here **can** be genuine secrets — which is exactly why
the Google Places key was noted in Phase 9 as belonging behind a proxy like this
one rather than in the client bundle.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Tokens that appear in this repository's examples and docs. Anyone who has
#: read the repository knows them.
PUBLISHED_EXAMPLE_TOKENS = frozenset({"demo-token", "local-dev-token"})

#: Shortest token accepted against a real project. 32 characters of
#: ``secrets.token_urlsafe`` is about 190 bits — far past guessing.
MIN_PRODUCTION_TOKEN_LENGTH = 32


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

    @model_validator(mode="after")
    def _refuse_a_weak_token_against_a_real_project(self) -> Self:
        """Refuse to start with a guessable token outside the emulator.

        `.env.example` ships ``ANALYSIS_API_TOKEN=demo-token`` so the emulator
        setup works as-is. Copied unchanged next to real credentials, that
        published token would let anyone write candidates into the moderation
        queue (SECURITY_AUDIT.md L4). Against the emulator it stays allowed: the
        emulator holds nothing worth protecting and the default should just work.
        """
        token = self.analysis_api_token
        if self.uses_emulator or token is None or token == "":
            return self
        if token in PUBLISHED_EXAMPLE_TOKENS or len(token) < MIN_PRODUCTION_TOKEN_LENGTH:
            raise ValueError(
                "ANALYSIS_API_TOKEN is the published example or shorter than "
                f"{MIN_PRODUCTION_TOKEN_LENGTH} characters, and FIRESTORE_EMULATOR_HOST is "
                "unset — this would protect a real project with a guessable token. Generate one "
                'with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings. Cleared in tests via ``get_settings.cache_clear()``."""
    return Settings()
