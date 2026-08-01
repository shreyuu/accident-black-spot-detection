"""Geographic helpers, including the geohash compatibility gate."""

from __future__ import annotations

import pytest

from app.algorithms.geo import (
    EARTH_RADIUS_M,
    bounding_radius_m,
    centroid,
    encode_geohash,
    haversine_distance_m,
)

#: Reference values produced by `geofire-common`, the library the mobile app
#: uses to build its geohash bounding-box queries.
#:
#: This is a compatibility contract, not a style choice: a candidate written
#: with an incompatible geohash is invisible to the query that would surface it,
#: and the failure is completely silent. Regenerate with:
#:   node -e "const {geohashForLocation}=require('geofire-common');
#:            console.log(geohashForLocation([51.5074,-0.1278]))"
GEOFIRE_REFERENCE: tuple[tuple[float, float, str], ...] = (
    (51.5074, -0.1278, "gcpvj0duq5"),
    (37.7749, -122.4194, "9q8yyk8ytp"),
    (-33.8688, 151.2093, "r3gx2f77bn"),
    (0.0, 0.0, "7zzzzzzzzz"),
    (90.0, 180.0, "zzzzzzzzzz"),
    (-90.0, -180.0, "0000000000"),
    (12.9716, 77.5946, "tdr1v9qtj1"),
)


class TestHaversine:
    def test_zero_for_the_same_point(self) -> None:
        assert haversine_distance_m(51.5, -0.1, 51.5, -0.1) == pytest.approx(0.0)

    def test_known_distance_london_to_paris(self) -> None:
        # ~343 km, a widely published figure for these coordinates.
        distance = haversine_distance_m(51.5074, -0.1278, 48.8566, 2.3522)

        assert distance == pytest.approx(343_000, rel=0.01)

    def test_is_symmetric(self) -> None:
        forward = haversine_distance_m(51.5, -0.1, 48.9, 2.4)
        backward = haversine_distance_m(48.9, 2.4, 51.5, -0.1)

        assert forward == pytest.approx(backward)

    def test_quarter_circumference_between_pole_and_equator(self) -> None:
        distance = haversine_distance_m(90.0, 0.0, 0.0, 0.0)

        assert distance == pytest.approx(EARTH_RADIUS_M * 3.14159265 / 2, rel=1e-6)

    def test_handles_antipodal_points_without_losing_precision(self) -> None:
        # asin loses precision here; atan2 does not.
        distance = haversine_distance_m(0.0, 0.0, 0.0, 180.0)

        assert distance == pytest.approx(EARTH_RADIUS_M * 3.14159265, rel=1e-6)


class TestCentroid:
    def test_single_point_is_its_own_centroid(self) -> None:
        latitude, longitude = centroid([(51.5, -0.1)])

        assert latitude == pytest.approx(51.5, abs=1e-9)
        assert longitude == pytest.approx(-0.1, abs=1e-9)

    def test_midpoint_of_two_nearby_points(self) -> None:
        latitude, longitude = centroid([(51.50, -0.10), (51.52, -0.10)])

        assert latitude == pytest.approx(51.51, abs=1e-4)
        assert longitude == pytest.approx(-0.10, abs=1e-4)

    def test_does_not_fall_apart_across_the_antimeridian(self) -> None:
        """Averaging degrees would give longitude 0 — the opposite side of the planet."""
        latitude, longitude = centroid([(0.0, 179.0), (0.0, -179.0)])

        assert latitude == pytest.approx(0.0, abs=1e-6)
        assert abs(longitude) == pytest.approx(180.0, abs=1e-4)

    def test_rejects_an_empty_input(self) -> None:
        with pytest.raises(ValueError, match="at least one point"):
            centroid([])


class TestGeohash:
    @pytest.mark.parametrize(("latitude", "longitude", "expected"), GEOFIRE_REFERENCE)
    def test_matches_geofire_common(self, latitude: float, longitude: float, expected: str) -> None:
        assert encode_geohash(latitude, longitude) == expected

    def test_default_precision_matches_geofire(self) -> None:
        assert len(encode_geohash(51.5074, -0.1278)) == 10

    def test_shorter_precision_is_a_prefix_of_longer(self) -> None:
        full = encode_geohash(51.5074, -0.1278, precision=10)

        assert encode_geohash(51.5074, -0.1278, precision=5) == full[:5]

    def test_nearby_points_share_a_prefix(self) -> None:
        a = encode_geohash(51.5074, -0.1278)
        b = encode_geohash(51.5075, -0.1279)

        assert a[:6] == b[:6]

    @pytest.mark.parametrize(
        ("latitude", "longitude"),
        [(91.0, 0.0), (-91.0, 0.0), (0.0, 181.0), (0.0, -181.0)],
    )
    def test_rejects_an_out_of_range_position(self, latitude: float, longitude: float) -> None:
        with pytest.raises(ValueError, match="out of range"):
            encode_geohash(latitude, longitude)

    def test_rejects_a_nonsensical_precision(self) -> None:
        with pytest.raises(ValueError, match="precision"):
            encode_geohash(51.5, -0.1, precision=0)


class TestBoundingRadius:
    def test_zero_for_a_single_point(self) -> None:
        assert bounding_radius_m((51.5, -0.1), [(51.5, -0.1)]) == pytest.approx(0.0)

    def test_is_the_distance_to_the_furthest_point(self) -> None:
        centre = (51.5, -0.1)
        points = [(51.5, -0.1), (51.5, -0.101), (51.51, -0.1)]

        expected = max(haversine_distance_m(*centre, lat, lon) for lat, lon in points)
        assert bounding_radius_m(centre, points) == pytest.approx(expected)

    def test_zero_for_no_points(self) -> None:
        assert bounding_radius_m((51.5, -0.1), []) == 0.0
