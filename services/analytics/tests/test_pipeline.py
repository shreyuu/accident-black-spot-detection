"""The pipeline end to end: reports in, candidates out."""

from __future__ import annotations

from datetime import UTC, datetime

from app.algorithms.geo import encode_geohash
from app.models.domain import (
    ALGORITHM_VERSION,
    BlackSpotCategory,
    BlackSpotSource,
    IncidentSeverity,
    IncidentType,
    ReportStatus,
)
from app.services.pipeline import run_pipeline
from tests.conftest import NOW, make_report


def cluster_fixture(
    prefix: str,
    count: int = 6,
    *,
    start_m: float = 0.0,
    reporters: int = 3,
    incident_type: IncidentType = IncidentType.ACCIDENT,
    severity: IncidentSeverity = IncidentSeverity.MEDIUM,
    occurred_at: datetime | None = None,
):
    return [
        make_report(
            f"{prefix}-{index}",
            reporter_id=f"{prefix}-reporter-{index % reporters}",
            incident_type=incident_type,
            severity=severity,
            metres_north=start_m + index * 10.0,
            occurred_at=occurred_at,
            days_ago=None if occurred_at else 1.0 + index,
        )
        for index in range(count)
    ]


class TestEndToEnd:
    def test_produces_a_candidate_for_a_cluster(self) -> None:
        result = run_pipeline(cluster_fixture("a"), now=NOW, job_id="job-1")

        assert len(result.candidates) == 1
        assert result.candidates[0].report_count == 6

    def test_produces_nothing_from_scattered_reports(self) -> None:
        scattered = [
            make_report(f"s-{index}", reporter_id=f"r{index}", metres_north=index * 20_000.0)
            for index in range(5)
        ]

        result = run_pipeline(scattered, now=NOW, job_id="job-1")

        assert result.candidates == ()

    def test_produces_nothing_from_no_reports(self) -> None:
        result = run_pipeline([], now=NOW, job_id="job-1")

        assert result.candidates == ()
        assert result.job.reports_ingested == 0

    def test_handles_several_clusters(self) -> None:
        reports = [*cluster_fixture("a"), *cluster_fixture("b", start_m=20_000.0)]

        result = run_pipeline(reports, now=NOW, job_id="job-1")

        assert len(result.candidates) == 2


class TestCandidatesAreNeverPublished:
    """The standing project rule this module could most easily break."""

    def test_every_candidate_is_marked_as_algorithmic(self) -> None:
        result = run_pipeline(cluster_fixture("a"), now=NOW, job_id="job-1")

        assert result.candidates[0].source is BlackSpotSource.ALGORITHM

    def test_a_candidate_has_no_verified_or_active_field(self) -> None:
        """Those belong to `blackSpots` and are what the app's query requires.

        Without them a candidate cannot satisfy the mobile query even by
        accident, so it can never reach a user as an official warning.
        """
        fields = set(run_pipeline(cluster_fixture("a"), now=NOW, job_id="j").candidates[0].__dict__)

        assert "verified" not in fields
        assert "active" not in fields

    def test_unapproved_reports_never_reach_a_candidate(self) -> None:
        pending = [
            make_report(
                f"p-{index}",
                reporter_id=f"r{index}",
                metres_north=index * 10.0,
                status=ReportStatus.PENDING,
            )
            for index in range(8)
        ]

        result = run_pipeline(pending, now=NOW, job_id="job-1")

        assert result.candidates == ()

    def test_a_mix_keeps_only_the_approved_reports(self) -> None:
        approved = cluster_fixture("a", count=6)
        pending = [
            make_report(
                f"p-{index}",
                reporter_id=f"pr{index}",
                metres_north=index * 10.0,
                status=ReportStatus.PENDING,
            )
            for index in range(6)
        ]

        result = run_pipeline([*approved, *pending], now=NOW, job_id="job-1")

        assert len(result.candidates) == 1
        assert all(rid.startswith("a-") for rid in result.candidates[0].report_ids)


class TestCandidateContent:
    def test_geohash_matches_the_centroid(self) -> None:
        candidate = run_pipeline(cluster_fixture("a"), now=NOW, job_id="j").candidates[0]

        assert candidate.geohash == encode_geohash(candidate.latitude, candidate.longitude)

    def test_carries_the_algorithm_version(self) -> None:
        candidate = run_pipeline(cluster_fixture("a"), now=NOW, job_id="j").candidates[0]

        assert candidate.algorithm_version == ALGORITHM_VERSION

    def test_carries_the_score_breakdown(self) -> None:
        candidate = run_pipeline(cluster_fixture("a"), now=NOW, job_id="j").candidates[0]

        assert set(candidate.score_components) == {
            "corroboration",
            "severity",
            "volume",
            "recency",
        }

    def test_attaches_patterns_found_by_eclat(self) -> None:
        night = datetime(2026, 5, 20, 2, tzinfo=UTC)
        candidate = run_pipeline(
            cluster_fixture("a", count=8, occurred_at=night), now=NOW, job_id="j"
        ).candidates[0]

        assert candidate.patterns
        assert any("night" in pattern for pattern in candidate.patterns)

    def test_patterns_are_never_single_items(self) -> None:
        """ "incident type accident — in 80% of reports here" restates the
        category rather than saying anything about co-occurrence."""
        candidate = run_pipeline(cluster_fixture("a", count=8), now=NOW, job_id="j").candidates[0]

        for pattern in candidate.patterns:
            assert " and " in pattern

    def test_ids_are_derived_from_the_job_and_cluster(self) -> None:
        candidate = run_pipeline(cluster_fixture("a"), now=NOW, job_id="job-42").candidates[0]

        assert candidate.id.startswith("job-42--")


class TestCategoryChoice:
    def test_accident_reports_produce_an_accident_category(self) -> None:
        candidate = run_pipeline(
            cluster_fixture("a", incident_type=IncidentType.ACCIDENT), now=NOW, job_id="j"
        ).candidates[0]

        assert candidate.category is BlackSpotCategory.ACCIDENT

    def test_crime_reports_produce_a_crime_category(self) -> None:
        candidate = run_pipeline(
            cluster_fixture("a", incident_type=IncidentType.CRIME), now=NOW, job_id="j"
        ).candidates[0]

        assert candidate.category is BlackSpotCategory.CRIME

    def test_road_defects_produce_an_unsafe_road_category(self) -> None:
        candidate = run_pipeline(
            cluster_fixture("a", incident_type=IncidentType.POTHOLE), now=NOW, job_id="j"
        ).candidates[0]

        assert candidate.category is BlackSpotCategory.UNSAFE_ROAD

    def test_both_kinds_present_produces_mixed_not_the_majority(self) -> None:
        """A location with both is genuinely both.

        Flattening to the majority would understate one of them to a user
        deciding whether to take that road at night.
        """
        reports = [
            *cluster_fixture("a", count=6, incident_type=IncidentType.ACCIDENT),
            *[
                make_report(
                    f"c-{index}",
                    reporter_id=f"cr{index}",
                    incident_type=IncidentType.CRIME,
                    metres_north=index * 10.0,
                    days_ago=20.0 + index,
                )
                for index in range(2)
            ],
        ]

        result = run_pipeline(reports, now=NOW, job_id="j")

        assert result.candidates[0].category is BlackSpotCategory.MIXED


class TestJobMetadata:
    def test_records_what_the_run_did(self) -> None:
        reports = [
            *cluster_fixture("a", count=6),
            make_report("rejected", status=ReportStatus.REJECTED),
        ]

        job = run_pipeline(reports, now=NOW, job_id="job-1").job

        assert job.reports_ingested == 7
        assert job.reports_after_cleaning == 6
        assert job.clusters_found == 1
        assert job.candidates_written == 1
        assert job.status == "completed"

    def test_records_every_parameter_that_affected_the_result(self) -> None:
        job = run_pipeline(
            cluster_fixture("a"), now=NOW, job_id="j", eps_m=200.0, min_samples=4, min_support=0.6
        ).job

        assert job.parameters["eps_m"] == 200.0
        assert job.parameters["min_samples"] == 4
        assert job.parameters["min_support"] == 0.6
        assert job.parameters["algorithm_version"] == ALGORITHM_VERSION

    def test_counts_duplicates_removed(self) -> None:
        reports = [
            *cluster_fixture("a", count=6),
            # Same person, same place, same minute as a-0.
            make_report("dupe", reporter_id="a-reporter-0", metres_north=0.0, days_ago=1.0),
        ]

        job = run_pipeline(reports, now=NOW, job_id="j").job

        assert job.duplicates_removed == 1


class TestReproducibility:
    """A stated acceptance criterion."""

    def test_the_same_input_produces_identical_candidates(self) -> None:
        reports = cluster_fixture("a", count=8)

        first = run_pipeline(reports, now=NOW, job_id="job-1")
        second = run_pipeline(reports, now=NOW, job_id="job-1")

        assert [c.model_dump() for c in first.candidates] == [
            c.model_dump() for c in second.candidates
        ]

    def test_input_order_does_not_change_the_result(self) -> None:
        reports = cluster_fixture("a", count=8)

        forwards = run_pipeline(reports, now=NOW, job_id="job-1")
        backwards = run_pipeline(list(reversed(reports)), now=NOW, job_id="job-1")

        assert [c.model_dump() for c in forwards.candidates] == [
            c.model_dump() for c in backwards.candidates
        ]

    def test_re_running_a_job_reuses_its_candidate_ids(self) -> None:
        """So a re-run overwrites its own candidates rather than piling up
        near-duplicates in the moderation queue."""
        reports = cluster_fixture("a", count=8)

        first = run_pipeline(reports, now=NOW, job_id="job-7")
        second = run_pipeline(reports, now=NOW, job_id="job-7")

        assert [c.id for c in first.candidates] == [c.id for c in second.candidates]
