"""Configuration that must refuse to start rather than run open."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.main import docs_urls

STRONG = "x" * 40


class TestTokenStrength:
    """A real deployment must not run on the token printed in `.env.example`.

    Anyone who has read the repository knows `demo-token`. Against the emulator
    that is harmless — and convenient — but against a real project it would let
    them write candidates into the moderation queue (SECURITY_AUDIT.md L4).
    """

    def test_refuses_the_example_token_against_a_real_project(self) -> None:
        with pytest.raises(ValidationError, match="ANALYSIS_API_TOKEN"):
            Settings(firestore_emulator_host=None, analysis_api_token="demo-token")

    def test_refuses_a_short_token_against_a_real_project(self) -> None:
        with pytest.raises(ValidationError, match="ANALYSIS_API_TOKEN"):
            Settings(firestore_emulator_host=None, analysis_api_token="short-but-not-demo")

    def test_accepts_a_long_token_against_a_real_project(self) -> None:
        settings = Settings(firestore_emulator_host=None, analysis_api_token=STRONG)

        assert settings.analysis_api_token == STRONG

    def test_allows_the_example_token_against_the_emulator(self) -> None:
        settings = Settings(
            firestore_emulator_host="127.0.0.1:8080", analysis_api_token="demo-token"
        )

        assert settings.uses_emulator

    def test_still_allows_no_token_at_all(self) -> None:
        # Unset already fails closed at request time — every call refused.
        assert (
            Settings(firestore_emulator_host=None, analysis_api_token=None).analysis_api_token
            is None
        )


class TestApiDocs:
    def test_are_served_against_the_emulator(self) -> None:
        urls = docs_urls(Settings(firestore_emulator_host="127.0.0.1:8080"))

        assert urls["docs_url"] == "/docs"

    def test_are_not_served_against_a_real_project(self) -> None:
        # The schema is an unauthenticated map of the service's surface; a
        # deployment has no reader for it.
        urls = docs_urls(Settings(firestore_emulator_host=None, analysis_api_token=STRONG))

        assert urls == {"docs_url": None, "redoc_url": None, "openapi_url": None}
