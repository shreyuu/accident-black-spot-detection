"""DBSCAN clustering of cleaned reports."""

from __future__ import annotations

import pytest

from app.algorithms.clustering import DEFAULT_EPS_M, cluster_reports
from app.algorithms.geo import haversine_distance_m
from app.models.domain import BLACK_SPOT_RADIUS_MAX_M, BLACK_SPOT_RADIUS_MIN_M
from tests.conftest import BASE_LON, make_report


def tight_group(prefix: str, count: int, *, start_m: float = 0.0, reporters: int = 3):
    """``count`` reports within a few metres of ``start_m``."""
    return [
        make_report(
            f"{prefix}-{index}",
            reporter_id=f"reporter-{index % reporters}",
            metres_north=start_m + index * 10.0,
        )
        for index in range(count)
    ]


class TestClusterFormation:
    def test_groups_reports_that_are_close_together(self) -> None:
        clusters = cluster_reports(tight_group("a", 4))

        assert len(clusters) == 1
        assert clusters[0].report_count == 4

    def test_separates_groups_that_are_far_apart(self) -> None:
        reports = [*tight_group("a", 4), *tight_group("b", 4, start_m=5000.0)]

        clusters = cluster_reports(reports)

        assert len(clusters) == 2

    def test_requires_the_minimum_number_of_reports(self) -> None:
        """Two reports is a coincidence often enough that publishing on it would
        fill the moderation queue with noise."""
        assert cluster_reports(tight_group("a", 2), min_samples=3) == []

    def test_forms_a_cluster_at_exactly_the_minimum(self) -> None:
        assert len(cluster_reports(tight_group("a", 3), min_samples=3)) == 1

    def test_discards_an_isolated_report_as_noise(self) -> None:
        """A single report in the middle of nowhere is not a black spot.

        Forcing it into the nearest cluster — which k-means would — manufactures
        a hazard out of an isolated event.
        """
        reports = [*tight_group("a", 4), make_report("lonely", metres_north=50_000.0)]

        clusters = cluster_reports(reports)

        assert len(clusters) == 1
        assert "lonely" not in clusters[0].report_ids

    def test_returns_nothing_for_too_few_reports_to_cluster(self) -> None:
        assert cluster_reports([make_report("only")]) == []

    def test_returns_nothing_for_no_reports(self) -> None:
        assert cluster_reports([]) == []


class TestGeography:
    def test_uses_real_distance_rather_than_degrees(self) -> None:
        """A degree of longitude is ~111 km at the equator and ~0 near the poles.

        Euclidean distance on raw coordinates would cluster these; haversine
        must not, because at latitude 60 they are only ~55 km apart in longitude
        terms but still far beyond eps.
        """
        far_apart = [
            make_report(f"n-{index}", latitude=60.0, longitude=BASE_LON + index * 0.02)
            for index in range(4)
        ]

        clusters = cluster_reports(far_apart, eps_m=DEFAULT_EPS_M)

        assert clusters == []

    def test_centroid_sits_among_its_members(self) -> None:
        reports = tight_group("a", 5)

        cluster = cluster_reports(reports)[0]

        for report in reports:
            distance = haversine_distance_m(
                cluster.centroid_latitude,
                cluster.centroid_longitude,
                report.latitude,
                report.longitude,
            )
            assert distance < 200.0

    def test_radius_is_floored_at_the_minimum_black_spot_size(self) -> None:
        """A 20 m warning circle is smaller than GPS error and fires unreliably."""
        cluster = cluster_reports(tight_group("a", 3))[0]

        assert cluster.radius_m >= BLACK_SPOT_RADIUS_MIN_M

    def test_radius_is_capped_at_the_maximum(self) -> None:
        # A long thin chain of reports, each within eps of the next, so DBSCAN
        # links them into one very stretched cluster.
        chain = [
            make_report(f"c-{index}", reporter_id=f"r{index}", metres_north=index * 100.0)
            for index in range(120)
        ]

        clusters = cluster_reports(chain, eps_m=DEFAULT_EPS_M)

        assert clusters
        assert all(cluster.radius_m <= BLACK_SPOT_RADIUS_MAX_M for cluster in clusters)


class TestClusterSummary:
    def test_counts_distinct_reporters_not_reports(self) -> None:
        """Twenty reports from one person is one person's opinion."""
        reports = [
            make_report(f"r-{index}", reporter_id="alice", metres_north=index * 10.0)
            for index in range(5)
        ]

        cluster = cluster_reports(reports)[0]

        assert cluster.report_count == 5
        assert cluster.distinct_reporters == 1

    def test_counts_several_reporters(self) -> None:
        cluster = cluster_reports(tight_group("a", 6, reporters=3))[0]

        assert cluster.distinct_reporters == 3

    def test_carries_the_member_types_and_severities(self) -> None:
        cluster = cluster_reports(tight_group("a", 4))[0]

        assert len(cluster.incident_types) == 4
        assert len(cluster.severities) == 4


class TestDeterminism:
    def test_the_same_input_produces_the_same_clusters(self) -> None:
        reports = [*tight_group("a", 5), *tight_group("b", 5, start_m=8000.0)]

        first = cluster_reports(reports)
        second = cluster_reports(reports)

        assert [(c.id, c.report_ids) for c in first] == [(c.id, c.report_ids) for c in second]

    def test_member_ids_are_sorted_regardless_of_input_order(self) -> None:
        reports = tight_group("a", 5)

        forwards = cluster_reports(reports)[0]
        backwards = cluster_reports(list(reversed(reports)))[0]

        assert forwards.report_ids == backwards.report_ids
        assert list(forwards.report_ids) == sorted(forwards.report_ids)

    def test_clusters_are_ordered_largest_first(self) -> None:
        reports = [*tight_group("small", 3), *tight_group("big", 8, start_m=9000.0)]

        clusters = cluster_reports(reports)

        assert [c.report_count for c in clusters] == sorted(
            [c.report_count for c in clusters], reverse=True
        )


class TestParameterValidation:
    @pytest.mark.parametrize("eps_m", [0.0, -1.0])
    def test_rejects_a_nonsensical_radius(self, eps_m: float) -> None:
        with pytest.raises(ValueError, match="eps_m"):
            cluster_reports(tight_group("a", 3), eps_m=eps_m)

    def test_rejects_a_nonsensical_minimum(self) -> None:
        with pytest.raises(ValueError, match="min_samples"):
            cluster_reports(tight_group("a", 3), min_samples=0)
