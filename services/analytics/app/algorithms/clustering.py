"""Spatial clustering of cleaned reports, with DBSCAN.

DBSCAN rather than k-means, for two reasons that matter here:

* **The number of clusters is not known in advance.** k-means requires k, and
  there is no defensible way to pick "how many black spots exist near this
  city".
* **It has a concept of noise.** A single report in the middle of nowhere is not
  a black spot, and DBSCAN labels it as noise instead of forcing it into the
  nearest group. Forcing it would manufacture hazards out of isolated events,
  which is precisely the failure this service must not have.

The metric is Haversine on radians — not Euclidean on degrees. A degree of
longitude is ~111 km at the equator and ~0 at the poles, so Euclidean distance
on raw coordinates silently makes clusters wider near the equator and narrower
near the poles.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from sklearn.cluster import DBSCAN

from app.algorithms.geo import EARTH_RADIUS_M, bounding_radius_m, centroid
from app.models.domain import (
    BLACK_SPOT_RADIUS_MAX_M,
    BLACK_SPOT_RADIUS_MIN_M,
    Cluster,
    IncidentReport,
)

#: Neighbourhood radius, in metres.
#:
#: 150 m is about a junction and its approaches — the scale at which "the same
#: dangerous place" is a meaningful statement. Much larger and a whole
#: neighbourhood collapses into one candidate that is too vague to warn about;
#: much smaller and the same junction fragments into several.
DEFAULT_EPS_M = 150.0

#: Reports needed before somewhere counts as a cluster.
#:
#: Three, not two. Two reports is a coincidence often enough that publishing on
#: it would fill the moderation queue with noise, and every candidate a moderator
#: rejects makes the next one less likely to be read carefully.
DEFAULT_MIN_SAMPLES = 3


def cluster_reports(
    reports: Sequence[IncidentReport],
    *,
    eps_m: float = DEFAULT_EPS_M,
    min_samples: int = DEFAULT_MIN_SAMPLES,
) -> list[Cluster]:
    """Group nearby reports into clusters.

    Reports DBSCAN labels as noise are dropped: they are isolated events, not
    black spots.

    Returns:
        Clusters ordered by descending report count, then by id — deterministic,
        so a moderator sees the same ordering on a re-run.
    """
    if eps_m <= 0:
        raise ValueError(f"eps_m must be positive, got {eps_m}")
    if min_samples < 1:
        raise ValueError(f"min_samples must be at least 1, got {min_samples}")

    if len(reports) < min_samples:
        return []

    # DBSCAN's haversine metric works in radians and returns radians, so the
    # neighbourhood radius is converted to an angle.
    coordinates = np.array(
        [[math.radians(report.latitude), math.radians(report.longitude)] for report in reports]
    )
    eps_radians = eps_m / EARTH_RADIUS_M

    labels = DBSCAN(
        eps=eps_radians,
        min_samples=min_samples,
        metric="haversine",
        # ball_tree is the only algorithm supporting haversine; naming it makes
        # the choice explicit rather than leaving it to sklearn's heuristics,
        # which could change between versions and shift results.
        algorithm="ball_tree",
    ).fit_predict(coordinates)

    grouped: dict[int, list[IncidentReport]] = {}
    for label, report in zip(labels, reports, strict=True):
        if label == -1:
            # Noise. Deliberately discarded.
            continue
        grouped.setdefault(int(label), []).append(report)

    clusters = [_build_cluster(label, members) for label, members in sorted(grouped.items())]

    return sorted(clusters, key=lambda cluster: (-cluster.report_count, cluster.id))


def _build_cluster(label: int, members: Sequence[IncidentReport]) -> Cluster:
    """Summarise one DBSCAN group."""
    # Sorted so the id, the centroid and the member list are all independent of
    # the order Firestore happened to return.
    ordered = sorted(members, key=lambda report: report.id)
    points = [(report.latitude, report.longitude) for report in ordered]

    centre = centroid(points)
    spread = bounding_radius_m(centre, points)

    # Floored at the minimum sane black spot radius: a cluster of three reports
    # within 20 m of each other is real, but a 20 m warning circle would be
    # smaller than GPS error and would fire unreliably or not at all. Capped at
    # the maximum so a stretched cluster cannot propose a 10 km hazard.
    radius = min(max(spread, float(BLACK_SPOT_RADIUS_MIN_M)), float(BLACK_SPOT_RADIUS_MAX_M))

    return Cluster(
        id=f"cluster-{label}",
        centroid_latitude=centre[0],
        centroid_longitude=centre[1],
        radius_m=radius,
        report_ids=tuple(report.id for report in ordered),
        # Distinct people, not distinct reports. Twenty reports from one person
        # is one person's opinion; three from three people is corroboration.
        distinct_reporters=len({report.reporter_id for report in ordered}),
        incident_types=tuple(report.type for report in ordered),
        severities=tuple(report.severity for report in ordered),
    )
