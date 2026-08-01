"""Turning reports into the transactions ECLAT mines.

ECLAT needs a set of transactions, each a set of item labels. The modelling
decision — what counts as a transaction, and what counts as an item — determines
what patterns can be found at all, so it is spelled out here rather than being
implicit in a list comprehension.

**One report is one transaction.** The alternative, one *cluster* per
transaction, was rejected: with a handful of clusters there are too few
transactions for a support threshold to mean anything, and the patterns found
would be about which clusters resemble each other rather than about what tends
to happen at a dangerous place. Per-report transactions answer the useful
question — "what co-occurs at incidents here" — and there are enough of them for
support to be a real measurement.

Items are ``key=value`` strings. Namespacing prevents a collision that would
otherwise be silent: severity ``high`` and incident type ``high`` would be the
same item, and a pattern mixing them would be nonsense that looks plausible.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.models.domain import IncidentReport

#: Time-of-day buckets, chosen to correspond to how driving conditions actually
#: differ rather than to equal-sized slices of the clock.
_TIME_BANDS: tuple[tuple[str, int, int], ...] = (
    ("night", 0, 6),
    ("morning-peak", 6, 10),
    ("daytime", 10, 16),
    ("evening-peak", 16, 20),
    ("evening", 20, 24),
)


def time_band(moment: datetime) -> str:
    """Which part of the day a time falls in.

    Uses the timestamp as stored. No timezone conversion is attempted: the
    service does not know the reporter's local offset, and guessing one would
    place incidents in the wrong band with an air of precision. This is stated
    in the methodology document as a known limitation.
    """
    hour = moment.hour
    for name, start, end in _TIME_BANDS:
        if start <= hour < end:
            return name
    # Unreachable for a valid hour; kept so a malformed datetime cannot raise
    # inside a pipeline whose other stages all degrade gracefully.
    return "unknown"


def day_kind(moment: datetime) -> str:
    """Weekday or weekend. A coarse but genuinely different traffic pattern."""
    return "weekend" if moment.weekday() >= 5 else "weekday"


def report_to_transaction(report: IncidentReport) -> list[str]:
    """The item set for one report.

    Every item is derived from a field the reporter chose from a fixed list, or
    from the timestamp. No free text is involved: description text is not even
    read from Firestore, so a pattern can never accidentally surface something
    someone wrote about themselves or another person.
    """
    items = [
        f"type={report.type.value}",
        f"severity={report.severity.value}",
    ]

    moment = report.effective_time
    if moment is not None:
        items.append(f"time={time_band(moment)}")
        items.append(f"day={day_kind(moment)}")

    return items


def build_transactions(reports: Sequence[IncidentReport]) -> list[list[str]]:
    """One transaction per report, in the order given."""
    return [report_to_transaction(report) for report in reports]


def describe_itemset(items: Sequence[str], support: float) -> str:
    """A pattern in words a moderator can act on.

    The output is read by a human deciding whether to publish a hazard warning,
    so it says what was observed and how often — never what will happen. "3 in 4
    incidents here were accidents at night" is a description; "accidents happen
    here at night" is a prediction this service is not entitled to make.
    """
    readable = {
        "type": "incident type",
        "severity": "severity",
        "time": "time of day",
        "day": "day type",
    }

    parts: list[str] = []
    for item in items:
        key, _, value = item.partition("=")
        parts.append(f"{readable.get(key, key)} {value}")

    percentage = round(support * 100)
    return f"{' and '.join(parts)} — in {percentage}% of reports here"
