"""Geographic helpers.

Deliberately mirrors ``apps/mobile/src/utils/geo.ts``: the same earth radius and
the same Haversine formula, so a distance computed here and one shown on the
phone agree. A candidate whose radius is computed with a different constant than
the circle the app draws would produce warnings that fire outside the drawn
circle — the exact class of bug Phase 4 designed against.

The geohash encoder is written out rather than pulled from a package because it
must match `geofire-common`, which the mobile app uses to build its bounding-box
queries. A candidate with an incompatible geohash is invisible to the very query
that would surface it.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

#: Mean earth radius in metres. Identical to EARTH_RADIUS_M in geo.ts.
EARTH_RADIUS_M = 6_371_008.8

#: Standard geohash alphabet. Not base32 in the RFC sense — this ordering is
#: specific to geohashing and is what geofire-common uses.
_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

#: Matches GEOHASH_PRECISION in geofire-common. A shorter hash would place a
#: candidate in a coarser cell than the app's queries expect.
GEOHASH_PRECISION = 10


def haversine_distance_m(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> float:
    """Great-circle distance in metres."""
    phi1 = math.radians(from_lat)
    phi2 = math.radians(to_lat)
    delta_phi = math.radians(to_lat - from_lat)
    delta_lambda = math.radians(to_lon - from_lon)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    # atan2 rather than asin: numerically stable for antipodal points, where
    # `a` approaches 1 and asin loses precision badly.
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def centroid(points: Sequence[tuple[float, float]]) -> tuple[float, float]:
    """Mean position of ``(latitude, longitude)`` pairs.

    Computed in 3D Cartesian space and projected back, not by averaging degrees.
    Averaging longitudes is wrong across the antimeridian: the mean of +179 and
    -179 degrees is 0°, which is the opposite side of the planet. Clusters here are
    small enough that it rarely matters — but "rarely" is not a reason to ship
    an operation that is simply incorrect.
    """
    if not points:
        raise ValueError("centroid requires at least one point")

    x = y = z = 0.0
    for latitude, longitude in points:
        phi = math.radians(latitude)
        theta = math.radians(longitude)
        x += math.cos(phi) * math.cos(theta)
        y += math.cos(phi) * math.sin(theta)
        z += math.sin(phi)

    count = len(points)
    x /= count
    y /= count
    z /= count

    hypotenuse = math.sqrt(x * x + y * y)
    if hypotenuse < 1e-12 and abs(z) < 1e-12:
        # Points cancelled out exactly — antipodal pairs, so no meaningful mean
        # exists. Returning the first point is arbitrary but defined; silently
        # returning (0, 0) would put the centroid in the Gulf of Guinea.
        return points[0]

    return math.degrees(math.atan2(z, hypotenuse)), math.degrees(math.atan2(y, x))


def encode_geohash(latitude: float, longitude: float, precision: int = GEOHASH_PRECISION) -> str:
    """Encode a position as a geohash.

    The standard interleaved binary-subdivision algorithm: alternate between
    halving the longitude range and the latitude range, emitting one bit each
    time, and pack every five bits into a base32 character.
    """
    if not -90.0 <= latitude <= 90.0:
        raise ValueError(f"latitude out of range: {latitude}")
    if not -180.0 <= longitude <= 180.0:
        raise ValueError(f"longitude out of range: {longitude}")
    if precision < 1:
        raise ValueError(f"precision must be at least 1, got {precision}")

    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]

    hash_chars: list[str] = []
    bits = 0
    bit_count = 0
    use_longitude = True

    while len(hash_chars) < precision:
        if use_longitude:
            mid = (lon_range[0] + lon_range[1]) / 2
            if longitude > mid:
                bits = (bits << 1) | 1
                lon_range[0] = mid
            else:
                bits <<= 1
                lon_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if latitude > mid:
                bits = (bits << 1) | 1
                lat_range[0] = mid
            else:
                bits <<= 1
                lat_range[1] = mid

        use_longitude = not use_longitude
        bit_count += 1

        if bit_count == 5:
            hash_chars.append(_BASE32[bits])
            bits = 0
            bit_count = 0

    return "".join(hash_chars)


def bounding_radius_m(centre: tuple[float, float], points: Sequence[tuple[float, float]]) -> float:
    """Distance from ``centre`` to the furthest point, in metres."""
    if not points:
        return 0.0
    return max(
        haversine_distance_m(centre[0], centre[1], latitude, longitude)
        for latitude, longitude in points
    )
