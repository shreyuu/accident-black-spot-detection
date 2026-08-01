"""Cleaning and de-duplication."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.models.domain import (
    IncidentReport,
    IncidentSeverity,
    IncidentType,
    ReportStatus,
)
from app.services.cleaning import (
    DUPLICATE_RADIUS_M,
    DUPLICATE_WINDOW_S,
    clean_reports,
)
from tests.conftest import NOW, make_report


class TestRejection:
    @pytest.mark.parametrize(
        "status",
        [ReportStatus.PENDING, ReportStatus.REJECTED, ReportStatus.DRAFT],
    )
    def test_drops_a_report_that_is_not_approved(self, status: ReportStatus) -> None:
        """The rule the whole moderation flow exists to enforce.

        Re-checked here even though the repository only queries approved
        reports — validating at both boundaries is the project's standing rule.
        """
        result = clean_reports([make_report("r1", status=status)])

        assert result.reports == ()
        assert result.rejected == 1

    def test_keeps_an_approved_report(self) -> None:
        result = clean_reports([make_report("r1")])

        assert len(result.reports) == 1
        assert result.rejected == 0

    def test_drops_a_position_at_null_island(self) -> None:
        # Where a dropped or zeroed coordinate lands. A cluster there would be
        # pure artefact.
        result = clean_reports([make_report("r1", latitude=0.0, longitude=0.0)])

        assert result.reports == ()

    def test_keeps_a_genuine_position_near_the_equator(self) -> None:
        # Guards against the null-island filter being too greedy.
        result = clean_reports([make_report("r1", latitude=0.5, longitude=32.5)])

        assert len(result.reports) == 1

    def test_drops_a_report_with_no_usable_timestamp(self) -> None:
        # Built directly: `make_report`'s `None` means "use the default", so it
        # cannot express a report that genuinely carries no time at all.
        undated = IncidentReport(
            id="r1",
            reporter_id="alice",
            type=IncidentType.ACCIDENT,
            severity=IncidentSeverity.MEDIUM,
            latitude=51.5074,
            longitude=-0.1278,
            status=ReportStatus.APPROVED,
            occurred_at=None,
            created_at=None,
        )

        result = clean_reports([undated])

        assert result.reports == ()
        assert result.rejected == 1

    def test_falls_back_to_created_at_when_the_reporter_gave_no_time(self) -> None:
        result = clean_reports([make_report("r1", occurred_at=None)])

        assert len(result.reports) == 1


class TestDeduplication:
    def test_collapses_one_reporter_repeating_the_same_event(self) -> None:
        reports = [
            make_report("r1", reporter_id="alice", occurred_at=NOW),
            make_report("r2", reporter_id="alice", occurred_at=NOW + timedelta(minutes=5)),
        ]

        result = clean_reports(reports)

        assert len(result.reports) == 1
        assert result.duplicates_removed == 1

    def test_never_collapses_reports_from_different_people(self) -> None:
        """Corroboration, not duplication.

        Two people reporting the same junction is the strongest evidence this
        service has. Collapsing it would delete the signal the risk score is
        built on, and would make one prolific reporter look like a crowd.
        """
        reports = [
            make_report("r1", reporter_id="alice", occurred_at=NOW),
            make_report("r2", reporter_id="bob", occurred_at=NOW),
        ]

        result = clean_reports(reports)

        assert len(result.reports) == 2
        assert result.duplicates_removed == 0

    def test_keeps_the_same_reporter_outside_the_time_window(self) -> None:
        reports = [
            make_report("r1", reporter_id="alice", occurred_at=NOW),
            make_report(
                "r2",
                reporter_id="alice",
                occurred_at=NOW + timedelta(seconds=DUPLICATE_WINDOW_S + 60),
            ),
        ]

        assert len(clean_reports(reports).reports) == 2

    def test_keeps_the_same_reporter_far_enough_apart(self) -> None:
        reports = [
            make_report("r1", reporter_id="alice", occurred_at=NOW, metres_north=0),
            make_report(
                "r2",
                reporter_id="alice",
                occurred_at=NOW,
                metres_north=DUPLICATE_RADIUS_M * 3,
            ),
        ]

        assert len(clean_reports(reports).reports) == 2

    def test_keeps_the_same_reporter_reporting_a_different_incident_type(self) -> None:
        reports = [
            make_report(
                "r1", reporter_id="alice", occurred_at=NOW, incident_type=IncidentType.ACCIDENT
            ),
            make_report(
                "r2", reporter_id="alice", occurred_at=NOW, incident_type=IncidentType.POTHOLE
            ),
        ]

        assert len(clean_reports(reports).reports) == 2

    def test_collapses_a_long_run_from_one_reporter(self) -> None:
        reports = [
            make_report(f"r{index}", reporter_id="alice", occurred_at=NOW) for index in range(6)
        ]

        result = clean_reports(reports)

        assert len(result.reports) == 1
        assert result.duplicates_removed == 5


class TestDeterminism:
    def test_the_surviving_report_does_not_depend_on_input_order(self) -> None:
        """Without a total sort order the survivor depends on Firestore's ordering."""
        a = make_report("r-aaa", reporter_id="alice", occurred_at=NOW)
        b = make_report("r-bbb", reporter_id="alice", occurred_at=NOW)

        forwards = clean_reports([a, b])
        backwards = clean_reports([b, a])

        assert [r.id for r in forwards.reports] == [r.id for r in backwards.reports]

    def test_output_is_ordered_oldest_first(self) -> None:
        reports = [
            make_report("newer", reporter_id="alice", days_ago=1),
            make_report("older", reporter_id="bob", days_ago=10),
        ]

        result = clean_reports(reports)

        assert [r.id for r in result.reports] == ["older", "newer"]


class TestCounts:
    def test_reports_what_it_did(self) -> None:
        reports = [
            make_report("keep-1", reporter_id="alice", occurred_at=NOW),
            make_report("dupe-1", reporter_id="alice", occurred_at=NOW),
            make_report("keep-2", reporter_id="bob", occurred_at=NOW),
            make_report("reject-1", status=ReportStatus.PENDING),
        ]

        result = clean_reports(reports)

        assert result.ingested == 4
        assert result.rejected == 1
        assert result.duplicates_removed == 1
        assert len(result.reports) == 2

    def test_handles_no_input(self) -> None:
        result = clean_reports([])

        assert result.reports == ()
        assert result.ingested == 0

    def test_severity_does_not_affect_deduplication(self) -> None:
        # Same person, same place, same minute, different severity: still one event.
        reports = [
            make_report("r1", reporter_id="alice", occurred_at=NOW, severity=IncidentSeverity.LOW),
            make_report("r2", reporter_id="alice", occurred_at=NOW, severity=IncidentSeverity.HIGH),
        ]

        assert len(clean_reports(reports).reports) == 1
