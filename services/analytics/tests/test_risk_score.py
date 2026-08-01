"""Risk scoring: reproducibility, bounds, and the weighting's intent."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.algorithms.clustering import cluster_reports
from app.algorithms.risk_score import (
    RECENCY_HORIZON_DAYS,
    WEIGHT_CORROBORATION,
    WEIGHT_RECENCY,
    WEIGHT_SEVERITY,
    WEIGHT_VOLUME,
    corroboration_component,
    recency_component,
    risk_level_for,
    score_cluster,
    severity_component,
    volume_component,
)
from app.models.domain import IncidentSeverity, RiskLevel
from tests.conftest import NOW, make_report


def scored(reports, *, now=NOW, containing="r-0"):
    """Cluster then score, the way the pipeline does.

    ``containing`` selects the cluster of interest by a member id rather than
    taking the first. Taking ``clusters[0]`` picks the *largest*, which silently
    becomes a different cluster as soon as a test adds reports elsewhere.
    """
    clusters = cluster_reports(reports)
    assert clusters, "fixture did not form a cluster"

    cluster = next((c for c in clusters if containing in c.report_ids), None)
    assert cluster is not None, f"no cluster contains {containing}"

    members = tuple(r for r in reports if r.id in cluster.report_ids)
    return score_cluster(cluster, members, now=now)


def group(count: int, *, reporters: int, severity=IncidentSeverity.MEDIUM, days_ago=1.0):
    return [
        make_report(
            f"r-{index}",
            reporter_id=f"reporter-{index % reporters}",
            severity=severity,
            metres_north=index * 10.0,
            days_ago=days_ago,
        )
        for index in range(count)
    ]


class TestWeights:
    def test_weights_sum_to_one(self) -> None:
        total = WEIGHT_CORROBORATION + WEIGHT_SEVERITY + WEIGHT_VOLUME + WEIGHT_RECENCY

        assert total == pytest.approx(1.0)

    def test_corroboration_outweighs_volume(self) -> None:
        """Distinct people is the strongest signal; raw count is the easiest to inflate."""
        assert WEIGHT_CORROBORATION > WEIGHT_VOLUME


class TestComponents:
    def test_components_are_bounded(self) -> None:
        for count in (0, 1, 5, 50, 5000):
            assert 0.0 <= corroboration_component(count) <= 1.0
            assert 0.0 <= volume_component(count) <= 1.0

    def test_corroboration_rises_with_distinct_reporters(self) -> None:
        assert corroboration_component(1) < corroboration_component(3)
        assert corroboration_component(3) < corroboration_component(5)

    def test_corroboration_has_diminishing_returns(self) -> None:
        """The first few witnesses matter enormously; the fortieth does not."""
        first_few = corroboration_component(5) - corroboration_component(1)
        much_later = corroboration_component(50) - corroboration_component(46)

        assert first_few > much_later * 10

    def test_corroboration_never_reaches_one(self) -> None:
        # Honest for a heuristic: no amount of evidence is total certainty.
        assert corroboration_component(10_000) < 1.0

    def test_severity_is_the_mean_not_the_maximum(self) -> None:
        """One 'high' among many 'low's must not score like all 'high'."""
        mostly_low = (IncidentSeverity.LOW,) * 9 + (IncidentSeverity.HIGH,)
        all_high = (IncidentSeverity.HIGH,) * 10

        assert severity_component(mostly_low) < severity_component(all_high) / 2

    def test_severity_orders_the_scale_correctly(self) -> None:
        assert (
            severity_component((IncidentSeverity.LOW,))
            < severity_component((IncidentSeverity.MEDIUM,))
            < severity_component((IncidentSeverity.HIGH,))
        )

    def test_severity_of_nothing_is_zero(self) -> None:
        assert severity_component(()) == 0.0


class TestRecency:
    def test_recent_incidents_score_near_one(self) -> None:
        reports = tuple(group(3, reporters=3, days_ago=0.5))

        assert recency_component(reports, now=NOW) > 0.99

    def test_decays_with_age(self) -> None:
        recent = tuple(group(3, reporters=3, days_ago=10))
        old = tuple(group(3, reporters=3, days_ago=400))

        assert recency_component(recent, now=NOW) > recency_component(old, now=NOW)

    def test_reaches_zero_at_the_horizon(self) -> None:
        ancient = tuple(group(3, reporters=3, days_ago=RECENCY_HORIZON_DAYS + 100))

        assert recency_component(ancient, now=NOW) == 0.0

    def test_uses_the_most_recent_report_not_the_mean(self) -> None:
        """A long history plus an incident last week is currently dangerous."""
        mixed = (
            make_report("old-1", days_ago=700),
            make_report("old-2", days_ago=650),
            make_report("fresh", days_ago=2),
        )

        assert recency_component(mixed, now=NOW) > 0.99

    def test_a_future_timestamp_cannot_inflate_the_score(self) -> None:
        # Clock skew or a mistyped date. Treated as "now", never as a bonus.
        future = (make_report("f", occurred_at=NOW + timedelta(days=30)),)

        assert recency_component(future, now=NOW) == 1.0

    def test_no_reports_scores_zero(self) -> None:
        assert recency_component((), now=NOW) == 0.0


class TestScoring:
    def test_score_is_within_bounds(self) -> None:
        for count, reporters in ((3, 1), (10, 5), (60, 30)):
            result = scored(group(count, reporters=reporters))
            assert 0 <= result.score <= 100

    def test_more_corroboration_scores_higher(self) -> None:
        one_person = scored(group(6, reporters=1))
        six_people = scored(group(6, reporters=6))

        assert six_people.score > one_person.score

    def test_higher_severity_scores_higher(self) -> None:
        low = scored(group(6, reporters=3, severity=IncidentSeverity.LOW))
        high = scored(group(6, reporters=3, severity=IncidentSeverity.HIGH))

        assert high.score > low.score

    def test_older_incidents_score_lower(self) -> None:
        recent = scored(group(6, reporters=3, days_ago=5))
        old = scored(group(6, reporters=3, days_ago=600))

        assert recent.score > old.score

    def test_returns_the_component_breakdown(self) -> None:
        """A moderator asked to publish a hazard is entitled to see why."""
        result = scored(group(6, reporters=3))

        assert set(result.components) == {"corroboration", "severity", "volume", "recency"}
        assert all(0.0 <= value <= 1.0 for value in result.components.values())

    def test_a_strong_cluster_scores_highly(self) -> None:
        result = scored(group(20, reporters=10, severity=IncidentSeverity.HIGH, days_ago=1))

        assert result.score >= 75
        assert result.risk_level is RiskLevel.CRITICAL

    def test_a_weak_cluster_scores_low(self) -> None:
        result = scored(group(3, reporters=1, severity=IncidentSeverity.LOW, days_ago=700))

        assert result.score < 25
        assert result.risk_level is RiskLevel.LOW


class TestReproducibility:
    """A stated acceptance criterion for this phase."""

    def test_the_same_cluster_always_scores_the_same(self) -> None:
        reports = group(8, reporters=4)

        first = scored(reports)
        second = scored(reports)

        assert first.score == second.score
        assert first.components == second.components

    def test_the_score_does_not_depend_on_report_order(self) -> None:
        reports = group(8, reporters=4)

        assert scored(reports).score == scored(list(reversed(reports))).score

    def test_the_score_does_not_depend_on_other_clusters_in_the_dataset(self) -> None:
        """Linear normalisation would make adding a busy new area silently lower
        every existing candidate's score — and a moderator would see previously
        reviewed candidates change for no reason connected to them."""
        target = group(6, reporters=3)
        alone = scored(target)

        elsewhere = [
            make_report(
                f"far-{index}",
                reporter_id=f"other-{index}",
                metres_north=40_000.0 + index * 10.0,
            )
            for index in range(50)
        ]
        with_neighbour = scored([*target, *elsewhere])

        assert alone.score == with_neighbour.score


class TestRiskLevelMapping:
    @pytest.mark.parametrize(
        ("score", "expected"),
        [
            (0, RiskLevel.LOW),
            (24, RiskLevel.LOW),
            (25, RiskLevel.MEDIUM),
            (49, RiskLevel.MEDIUM),
            (50, RiskLevel.HIGH),
            (74, RiskLevel.HIGH),
            (75, RiskLevel.CRITICAL),
            (100, RiskLevel.CRITICAL),
        ],
    )
    def test_maps_scores_onto_the_four_point_scale(self, score: int, expected: RiskLevel) -> None:
        assert risk_level_for(score) is expected
