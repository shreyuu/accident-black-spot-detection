"""HTTP surface, with Firestore stubbed out.

The repository is replaced wholesale: these tests are about routing, auth and
serialisation, and the pipeline itself is covered exhaustively elsewhere without
a database.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.models.domain import ALGORITHM_VERSION, BlackSpotCandidate
from tests.conftest import make_report

TOKEN = "test-token-value"

_written: list[BlackSpotCandidate] = []
_jobs_written: list[Any] = []


class StubRepository:
    """Stands in for FirestoreRepository. Records what it was asked to write."""

    def __init__(self, _settings: Settings) -> None:
        pass

    def fetch_approved_reports(self):
        return [
            make_report(
                f"r-{index}",
                reporter_id=f"reporter-{index % 3}",
                metres_north=index * 10.0,
                days_ago=1.0 + index,
            )
            for index in range(6)
        ]

    def write_candidates(self, candidates: Sequence[BlackSpotCandidate]) -> int:
        _written.extend(candidates)
        return len(candidates)

    def write_job(self, job: Any) -> None:
        _jobs_written.append(job)

    def latest_jobs(self, limit: int = 20) -> list[dict[str, Any]]:
        return [{"id": "job-1", "status": "completed"}]


@pytest.fixture(autouse=True)
def _stub_firestore(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    _written.clear()
    _jobs_written.clear()
    monkeypatch.setattr("app.api.routes.FirestoreRepository", StubRepository)
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A client with a token configured."""
    app.dependency_overrides[get_settings] = lambda: Settings(
        analysis_api_token=TOKEN, firestore_emulator_host="127.0.0.1:8080"
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def unconfigured_client() -> Iterator[TestClient]:
    """A client with **no** token configured — the misconfigured deployment."""
    app.dependency_overrides[get_settings] = lambda: Settings(analysis_api_token=None)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


class TestHealth:
    def test_is_reachable_without_a_token(self, unconfigured_client: TestClient) -> None:
        # A health check that needs a credential stops working when the
        # credential rotates.
        response = unconfigured_client.get("/health")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_reports_the_algorithm_version(self, client: TestClient) -> None:
        assert client.get("/health").json()["algorithm_version"] == ALGORITHM_VERSION


class TestAuthentication:
    def test_rejects_a_request_with_no_token(self, client: TestClient) -> None:
        assert client.post("/analyse", json={}).status_code == 401

    def test_rejects_a_wrong_token(self, client: TestClient) -> None:
        response = client.post("/analyse", json={}, headers={"Authorization": "Bearer wrong-value"})

        assert response.status_code == 401

    def test_rejects_a_malformed_authorization_header(self, client: TestClient) -> None:
        response = client.post("/analyse", json={}, headers={"Authorization": TOKEN})

        assert response.status_code == 401

    def test_fails_closed_when_no_token_is_configured(
        self, unconfigured_client: TestClient
    ) -> None:
        """A misconfigured deployment must be inert, not open.

        Matches the Firestore rules' default-deny posture.
        """
        response = unconfigured_client.post(
            "/analyse", json={}, headers={"Authorization": "Bearer anything"}
        )

        assert response.status_code == 503

    def test_jobs_also_requires_a_token(self, client: TestClient) -> None:
        assert client.get("/jobs").status_code == 401
        assert client.get("/jobs", headers=auth()).status_code == 200


class TestAnalyse:
    def test_runs_and_returns_candidates(self, client: TestClient) -> None:
        response = client.post("/analyse", json={}, headers=auth())

        assert response.status_code == 200
        body = response.json()
        assert body["reports_ingested"] == 6
        assert body["clusters_found"] == 1
        assert len(body["candidates"]) == 1

    def test_defaults_to_a_dry_run(self, client: TestClient) -> None:
        """The destructive form is the one you have to ask for.

        A run writes to the moderation queue; exploring the API must not fill it.
        """
        response = client.post("/analyse", json={}, headers=auth())

        assert response.json()["dry_run"] is True
        assert response.json()["candidates_written"] == 0
        assert _written == []

    def test_writes_only_when_asked(self, client: TestClient) -> None:
        response = client.post("/analyse", json={"dry_run": False}, headers=auth())

        assert response.json()["candidates_written"] == 1
        assert len(_written) == 1
        assert len(_jobs_written) == 1

    def test_every_response_restates_that_nothing_is_published(self, client: TestClient) -> None:
        notice = client.post("/analyse", json={}, headers=auth()).json()["notice"]

        assert "not visible to app users" in notice
        assert "never published automatically" in notice

    def test_candidate_summary_omits_report_ids(self, client: TestClient) -> None:
        """The service holds them for traceability, but a list of report ids is
        not something to hand out over an API."""
        candidate = client.post("/analyse", json={}, headers=auth()).json()["candidates"][0]

        assert "report_ids" not in candidate
        assert candidate["report_count"] == 6

    def test_candidate_carries_its_score_breakdown(self, client: TestClient) -> None:
        candidate = client.post("/analyse", json={}, headers=auth()).json()["candidates"][0]

        assert set(candidate["score_components"]) == {
            "corroboration",
            "severity",
            "volume",
            "recency",
        }

    def test_accepts_parameter_overrides(self, client: TestClient) -> None:
        response = client.post(
            "/analyse",
            json={"eps_m": 300.0, "min_samples": 3, "min_support": 0.6, "dry_run": True},
            headers=auth(),
        )

        assert response.status_code == 200

    @pytest.mark.parametrize(
        "payload",
        [
            {"eps_m": 0},
            {"eps_m": -5},
            {"eps_m": 999_999},
            {"min_samples": 1},
            {"min_samples": 500},
            {"min_support": 0},
            {"min_support": 1.5},
        ],
    )
    def test_rejects_out_of_range_parameters(
        self, client: TestClient, payload: dict[str, float]
    ) -> None:
        # These tune a process that writes to a moderation queue. A min_support
        # of 0.001 would bury a moderator in coincidences.
        response = client.post("/analyse", json=payload, headers=auth())

        assert response.status_code == 422
