"""
Tests for Arogya Map OpenStreetMap (Overpass) Service:
1. Mirror fallback when the first mirror fails (HTTP 502 / timeout simulation).
2. Cache hit on repeated queries (30-minute TTL).
3. Stale-while-error fallback when all live queries fail.
"""

import sys
import os
import time
from unittest.mock import patch, MagicMock

# Ensure backend directory is in path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import osm_service
from osm_service import get_osm_facilities, _OSM_CACHE, _STALE_CACHE


def test_mirror_fallback():
    print("\n--- Test 1: Mirror Fallback on 502 / Error ---")
    mock_502 = MagicMock()
    mock_502.status_code = 502

    mock_200 = MagicMock()
    mock_200.status_code = 200
    mock_200.json.return_value = {
        "elements": [
            {
                "type": "node",
                "id": 99901,
                "lat": 19.6970,
                "lon": 72.7685,
                "tags": {
                    "amenity": "hospital",
                    "name": "Mirror Fallback Hospital",
                    "phone": "02525-999000",
                    "addr:street": "Fallback Road"
                }
            }
        ]
    }

    # Simulate 1st mirror returning 502, 2nd mirror returning 200
    with patch('requests.post', side_effect=[mock_502, mock_200]) as mock_post:
        facilities, warn = osm_service.fetch_live_overpass(19.6978, 72.7690, 5000, 'all')
        print(f"Post call count: {mock_post.call_count}")
        assert mock_post.call_count == 2, f"Expected 2 calls to test fallback, got {mock_post.call_count}"
        assert facilities is not None, "Expected facilities from second mirror"
        assert len(facilities) == 1
        assert facilities[0]['name'] == 'Mirror Fallback Hospital'
        assert facilities[0]['source'] == 'osm'
        assert facilities[0]['total_beds'] is None
        print("PASS: First mirror returned 502; second mirror successfully fulfilled request!")


def test_cache_hit():
    print("\n--- Test 2: In-Memory Cache Hit on Repeated Query ---")
    _OSM_CACHE.clear()

    # Pre-populate cache key
    cache_key = (19.70, 72.77, 5.0, 'all')
    dummy_data = [{"id": "osm_cached_1", "name": "Cached Clinic", "type": "clinic", "lat": 19.70, "lng": 72.77, "distance_km": 0.5, "source": "osm"}]
    _OSM_CACHE[cache_key] = {"timestamp": time.time(), "data": dummy_data}

    # Calling get_osm_facilities with db_cursor=None should directly hit cache without making requests
    with patch('requests.post') as mock_post:
        res, warn = get_osm_facilities(19.6978, 72.7690, 5.0, 'all', db_cursor=None)
        assert mock_post.call_count == 0, "Requests should not be called on cache hit"
        assert len(res) == 1
        assert res[0]['name'] == 'Cached Clinic'
        print("PASS: Cache hit returned cached facility instantly in 0 requests!")


def test_stale_while_error():
    print("\n--- Test 3: Stale-While-Error Fallback when Mirrors Fail ---")
    _OSM_CACHE.clear()
    _STALE_CACHE.clear()

    cache_key = (19.70, 72.77, 5.0, 'all')
    stale_data = [{"id": "osm_stale_1", "name": "Stale Resilient Clinic", "type": "clinic", "lat": 19.70, "lng": 72.77, "distance_km": 0.8, "source": "osm"}]
    _STALE_CACHE[cache_key] = stale_data

    # All mirrors return 500
    mock_err = MagicMock()
    mock_err.status_code = 500

    with patch('requests.post', return_value=mock_err):
        res, warn = get_osm_facilities(19.6978, 72.7690, 5.0, 'all', db_cursor=None)
        assert len(res) == 1
        assert res[0]['name'] == 'Stale Resilient Clinic'
        assert warn is not None
        assert "Serving cached results" in warn
        print(f"PASS: Stale-while-error gracefully served cached results with warning: '{warn}'")


if __name__ == '__main__':
    test_mirror_fallback()
    test_cache_hit()
    test_stale_while_error()
    print("\nALL OVERPASS TESTS COMPLETED SUCCESSFULLY!")
