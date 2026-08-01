"""Scoring a cluster from 0 to 100.

The number this produces is shown to a moderator and, if they publish, becomes a
black spot's ``severityScore``. It therefore has two obligations beyond being
sensible: it must be **reproducible** — the same cluster must always score the
same — and it must be **explainable**, because a moderator being asked to put a
hazard warning in front of drivers deserves to see why the algorithm thinks so.
Both are why every component is returned alongside the total.

## The components, and why each is weighted as it is

============  ======  ========================================================
Component     Weight  Rationale
============  ======  ========================================================
Corroboration  0.35   How many *distinct people* reported here. The strongest
                      available evidence that a place is genuinely dangerous
                      rather than one person's bad day. Weighted highest for
                      that reason, and it counts people, not reports — twenty
                      reports from one person is one person's opinion.
Severity       0.30   What reporters said happened. A cluster of serious
                      incidents matters more than a cluster of potholes.
Volume         0.20   Total reports. Real but weakest of the three: it is the
                      easiest signal for one determined person to inflate,
                      which is exactly why it sits below corroboration.
Recency        0.15   How recent the incidents are. A junction fixed two years
                      ago should fade rather than warn forever.
============  ======  ========================================================

Every component is normalised with a **saturating** curve rather than a linear
one, and — importantly — the curve is absolute rather than relative to the
dataset. Scaling against the largest cluster present would mean adding a busy
new area silently lowered the score of every existing candidate, so a moderator
would see candidates they had already reviewed change score for reasons entirely
unconnected to them. Here, a cluster's score depends only on that cluster.

## What this score is not

It is not a probability, not a prediction, and not a measurement of danger. It
ranks clusters by how much evidence there is, using data that is crowd-sourced
and unevenly distributed. Somewhere with no reports scores nothing, and that is
a statement about reporting, not about safety. Nothing in the app presents this
number to an end user; it exists to order a moderation queue.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.domain import Cluster, IncidentReport, IncidentSeverity, RiskLevel, RiskScore

#: Component weights. Must sum to 1.0 — asserted in the tests.
WEIGHT_CORROBORATION = 0.35
WEIGHT_SEVERITY = 0.30
WEIGHT_VOLUME = 0.20
WEIGHT_RECENCY = 0.15

#: Distinct reporters at which corroboration reaches **half** its maximum.
#:
#: Five independent people is a strong signal, and the curve is shaped so that
#: getting there matters far more than anything beyond it.
CORROBORATION_HALF_POINT = 5

#: Reports at which volume reaches half its maximum.
VOLUME_HALF_POINT = 12

#: Age at which recency has decayed to zero, in days. Two years.
RECENCY_HORIZON_DAYS = 730.0

#: Severity weights, on the reporter's three-point scale.
_SEVERITY_WEIGHTS: dict[IncidentSeverity, float] = {
    IncidentSeverity.LOW: 0.25,
    IncidentSeverity.MEDIUM: 0.6,
    IncidentSeverity.HIGH: 1.0,
}

#: Score thresholds for each risk level. Ordered high → low for lookup.
_RISK_THRESHOLDS: tuple[tuple[int, RiskLevel], ...] = (
    (75, RiskLevel.CRITICAL),
    (50, RiskLevel.HIGH),
    (25, RiskLevel.MEDIUM),
    (0, RiskLevel.LOW),
)


def _saturating(value: float, half_point: float) -> float:
    """Map ``value`` into [0, 1) with diminishing returns.

    ``value / (value + k)``: zero at zero, exactly 0.5 at ``value == k``, and
    approaching but never reaching 1. Every extra report or reporter therefore
    adds less than the one before, which is the intended behaviour — the
    difference between one witness and five is enormous, the difference between
    forty and fifty is noise.

    An earlier version rescaled this so that reaching ``k`` scored a full 1.0.
    That was wrong in a way the tests caught: it lifted the *floor* as much as
    the ceiling, so the weakest possible cluster — three reports, one reporter,
    low severity, two years old — scored 28 and presented to a moderator as
    medium risk. Nothing about that cluster is medium risk. The un-rescaled
    curve scores it 18.

    A consequence worth stating: no cluster ever scores 100. That is honest for
    a heuristic ranking crowd-sourced evidence.
    """
    if value <= 0:
        return 0.0
    return value / (value + half_point)


def corroboration_component(distinct_reporters: int) -> float:
    """[0, 1) from how many distinct people reported."""
    return _saturating(float(distinct_reporters), float(CORROBORATION_HALF_POINT))


def volume_component(report_count: int) -> float:
    """[0, 1) from the number of reports."""
    return _saturating(float(report_count), float(VOLUME_HALF_POINT))


def severity_component(severities: tuple[IncidentSeverity, ...]) -> float:
    """[0, 1] as the mean reported severity.

    The mean rather than the maximum: one "high" among twenty "low"s should not
    score the same as twenty "high"s, and using the maximum would make the
    component trivially inflatable by a single report.
    """
    if not severities:
        return 0.0
    return sum(_SEVERITY_WEIGHTS[severity] for severity in severities) / len(severities)


def recency_component(reports: tuple[IncidentReport, ...], *, now: datetime) -> float:
    """[0, 1] from how recent the incidents are, decaying linearly to the horizon.

    Uses the most recent report rather than the mean age. A place with a long
    history *and* an incident last week is currently dangerous; averaging would
    let the old reports drag it down and hide that.
    """
    if not reports:
        return 0.0

    timestamps = [report.effective_time for report in reports]
    usable = [moment for moment in timestamps if moment is not None]
    if not usable:
        return 0.0

    most_recent = max(_as_utc(moment) for moment in usable)
    age_days = (_as_utc(now) - most_recent).total_seconds() / 86400.0

    if age_days <= 0:
        # A timestamp in the future. Treated as "now" rather than as a bonus:
        # a clock skew or a mistyped date must not be able to inflate a score.
        return 1.0

    return max(0.0, 1.0 - age_days / RECENCY_HORIZON_DAYS)


def _as_utc(moment: datetime) -> datetime:
    """Attach UTC to a naive datetime so comparisons cannot raise.

    Firestore returns aware datetimes, but a fixture or a hand-built record may
    be naive, and mixing the two raises `TypeError` mid-pipeline.
    """
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def risk_level_for(score: int) -> RiskLevel:
    """Map a 0-100 score onto the four-point risk vocabulary."""
    for threshold, level in _RISK_THRESHOLDS:
        if score >= threshold:
            return level
    return RiskLevel.LOW


def score_cluster(
    cluster: Cluster,
    reports: tuple[IncidentReport, ...],
    *,
    now: datetime,
) -> RiskScore:
    """Score one cluster, returning the total and every component.

    ``now`` is injected rather than read from the clock so a run is reproducible
    and the tests are exact — the same rule ``proximityEngine`` follows on the
    mobile side.
    """
    components = {
        "corroboration": corroboration_component(cluster.distinct_reporters),
        "severity": severity_component(cluster.severities),
        "volume": volume_component(cluster.report_count),
        "recency": recency_component(reports, now=now),
    }

    weighted = (
        components["corroboration"] * WEIGHT_CORROBORATION
        + components["severity"] * WEIGHT_SEVERITY
        + components["volume"] * WEIGHT_VOLUME
        + components["recency"] * WEIGHT_RECENCY
    )

    score = max(0, min(100, round(weighted * 100)))

    return RiskScore(
        score=score,
        risk_level=risk_level_for(score),
        # Rounded for storage: these are displayed to a moderator, and fifteen
        # decimal places of a heuristic implies a precision it does not have.
        components={name: round(value, 4) for name, value in components.items()},
    )
