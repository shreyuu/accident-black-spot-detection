"""Encoding reports as ECLAT transactions."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.algorithms.eclat import eclat
from app.algorithms.transactions import (
    build_transactions,
    day_kind,
    describe_itemset,
    report_to_transaction,
    time_band,
)
from app.models.domain import IncidentSeverity, IncidentType
from tests.conftest import make_report


class TestTimeBands:
    @pytest.mark.parametrize(
        ("hour", "expected"),
        [
            (0, "night"),
            (5, "night"),
            (6, "morning-peak"),
            (9, "morning-peak"),
            (10, "daytime"),
            (15, "daytime"),
            (16, "evening-peak"),
            (19, "evening-peak"),
            (20, "evening"),
            (23, "evening"),
        ],
    )
    def test_buckets_the_clock(self, hour: int, expected: str) -> None:
        moment = datetime(2026, 6, 1, hour, 30, tzinfo=UTC)

        assert time_band(moment) == expected

    def test_every_hour_falls_in_exactly_one_band(self) -> None:
        bands = {time_band(datetime(2026, 6, 1, hour, tzinfo=UTC)) for hour in range(24)}

        assert "unknown" not in bands


class TestDayKind:
    @pytest.mark.parametrize(
        ("day", "expected"),
        [(1, "weekday"), (5, "weekday"), (6, "weekend"), (7, "weekend"), (8, "weekday")],
    )
    def test_distinguishes_weekends(self, day: int, expected: str) -> None:
        # 2026-06-01 is a Monday, so day 6 and 7 are Saturday and Sunday.
        moment = datetime(2026, 6, day, 12, tzinfo=UTC)

        assert day_kind(moment) == expected


class TestEncoding:
    def test_namespaces_every_item(self) -> None:
        """Severity 'high' and a hypothetical type 'high' must not collide.

        An unnamespaced collision produces patterns that are nonsense but look
        entirely plausible.
        """
        items = report_to_transaction(make_report("r1"))

        assert all("=" in item for item in items)

    def test_carries_type_and_severity(self) -> None:
        items = report_to_transaction(
            make_report("r1", incident_type=IncidentType.POTHOLE, severity=IncidentSeverity.HIGH)
        )

        assert "type=pothole" in items
        assert "severity=high" in items

    def test_carries_time_and_day(self) -> None:
        items = report_to_transaction(
            make_report("r1", occurred_at=datetime(2026, 6, 6, 22, tzinfo=UTC))
        )

        assert "time=evening" in items
        assert "day=weekend" in items

    def test_contains_no_free_text_or_identifiers(self) -> None:
        """Descriptions and reporter ids must never become mineable items."""
        items = report_to_transaction(make_report("r1", reporter_id="alice"))

        assert not any("alice" in item for item in items)
        assert not any(item.split("=", 1)[1] == "r1" for item in items)

    def test_one_transaction_per_report(self) -> None:
        reports = [make_report(f"r{index}") for index in range(5)]

        assert len(build_transactions(reports)) == 5


class TestEndToEndWithEclat:
    def test_a_planted_pattern_is_found(self) -> None:
        """Six night-time accidents and two daytime potholes.

        The night/accident pattern is in 75% of reports and must surface.
        """
        night = datetime(2026, 6, 1, 2, tzinfo=UTC)
        day = datetime(2026, 6, 1, 13, tzinfo=UTC)

        reports = [
            *[
                make_report(f"n{index}", incident_type=IncidentType.ACCIDENT, occurred_at=night)
                for index in range(6)
            ],
            *[
                make_report(f"d{index}", incident_type=IncidentType.POTHOLE, occurred_at=day)
                for index in range(2)
            ],
        ]

        itemsets = eclat(build_transactions(reports), min_support=0.5)
        found = {frozenset(entry.items) for entry in itemsets}

        assert frozenset({"type=accident", "time=night"}) in found

    def test_a_pattern_below_support_is_not_reported(self) -> None:
        night = datetime(2026, 6, 1, 2, tzinfo=UTC)
        day = datetime(2026, 6, 1, 13, tzinfo=UTC)

        reports = [
            make_report("n0", incident_type=IncidentType.ACCIDENT, occurred_at=night),
            *[
                make_report(f"d{index}", incident_type=IncidentType.POTHOLE, occurred_at=day)
                for index in range(9)
            ],
        ]

        itemsets = eclat(build_transactions(reports), min_support=0.5)
        found = {frozenset(entry.items) for entry in itemsets}

        assert frozenset({"type=accident", "time=night"}) not in found


class TestDescriptions:
    def test_describes_a_pattern_in_words(self) -> None:
        text = describe_itemset(["type=accident", "time=night"], 0.75)

        assert "incident type accident" in text
        assert "time of day night" in text
        assert "75%" in text

    def test_describes_what_was_observed_not_what_will_happen(self) -> None:
        """The moderator is reading a description, not a prediction.

        This service is not entitled to say what will happen at a location.
        """
        text = describe_itemset(["type=accident", "time=night"], 0.75)

        assert "in 75% of reports here" in text
        for forbidden in ("will ", "likely", "expect", "predict", "risk of"):
            assert forbidden not in text.lower()

    def test_falls_back_gracefully_on_an_unknown_key(self) -> None:
        text = describe_itemset(["weather=fog"], 0.5)

        assert "weather fog" in text
