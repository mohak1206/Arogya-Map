"""
API Integration & Validation Tests for Arogya Map
Tests:
  1. GET /api/hospitals/nearest (immediate DB results, include_osm=false by default)
  2. GET /api/osm/nearest (OSM-only facilities)
  3. Input Validation (lat range -90..90, lng range -180..180, radius 1..30, type whitelist)
  4. Deduplication Logic (ensuring registered DB partner hospitals take precedence)
  5. OSM Down / Mirror Failure Handling (gracefully returning DB facilities with warning)
"""

import sys
import os
from unittest.mock import patch

# Ensure backend directory is in path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app
from osm_service import deduplicate_facilities


def test_api():
    client = app.test_client()

    print("\n--- 1. Testing GET /api/hospitals/nearest (DB immediate response) ---")
    res = client.get('/api/hospitals/nearest?lat=19.6978&lng=72.7690&radius=10')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.get_json()
    assert 'hospitals' in data
    assert 'count' in data
    print(f"PASS: Fetched {data['count']} DB hospitals.")
    if data['hospitals']:
        first = data['hospitals'][0]
        assert first['source'] == 'db'
        assert first['live'] is True
        assert 'total_beds' in first
        assert 'available_beds' in first

    print("\n--- 2. Testing GET /api/osm/nearest (OSM-only response) ---")
    res = client.get('/api/osm/nearest?lat=19.6978&lng=72.7690&radius=10')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    osm_data = res.get_json()
    print(f"PASS: Fetched {osm_data['count']} OSM facilities.")
    if osm_data['hospitals']:
        first_osm = osm_data['hospitals'][0]
        assert first_osm['source'] == 'osm'
        assert first_osm['live'] is False
        assert first_osm['total_beds'] is None
        assert first_osm['available_beds'] is None

    print("\n--- 3. Testing Input Validations ---")
    # Latitude > 90
    r1 = client.get('/api/hospitals/nearest?lat=95&lng=72.7690&radius=10')
    assert r1.status_code == 400
    assert 'Latitude must be between -90 and 90' in r1.get_json()['error']

    # Latitude < -90
    r2 = client.get('/api/hospitals/nearest?lat=-95&lng=72.7690&radius=10')
    assert r2.status_code == 400

    # Longitude > 180
    r3 = client.get('/api/hospitals/nearest?lat=19.6978&lng=190&radius=10')
    assert r3.status_code == 400
    assert 'Longitude must be between -180 and 180' in r3.get_json()['error']

    # Radius > 30 km (max 30)
    r4 = client.get('/api/hospitals/nearest?lat=19.6978&lng=72.7690&radius=35')
    assert r4.status_code == 400
    assert 'Radius must be between 1 and 30 km' in r4.get_json()['error']

    # Radius < 1 km
    r5 = client.get('/api/hospitals/nearest?lat=19.6978&lng=72.7690&radius=0')
    assert r5.status_code == 400

    # Invalid type
    r6 = client.get('/api/hospitals/nearest?lat=19.6978&lng=72.7690&radius=10&type=invalid_type')
    assert r6.status_code == 400
    assert 'Invalid type parameter' in r6.get_json()['error']
    print("PASS: All parameter boundary validations returned proper JSON 400 errors!")

    print("\n--- 4. Testing Deduplication Logic ---")
    mock_db = [
        {
            "id": 10,
            "name": "Palghar Rural Hospital",
            "lat": 19.6967,
            "lng": 72.7680,
            "source": "db"
        }
    ]
    mock_osm = [
        # Exactly near (within 100m) or identical name
        {
            "id": "osm_1",
            "name": "Palghar Rural Hospital (OSM Entry)",
            "lat": 19.6968,
            "lng": 72.7681,
            "source": "osm"
        },
        # Legitimate separate clinic 3 km away
        {
            "id": "osm_2",
            "name": "Distant Green Clinic",
            "lat": 19.7200,
            "lng": 72.7800,
            "source": "osm"
        }
    ]
    deduped = deduplicate_facilities(mock_osm, mock_db)
    assert len(deduped) == 1, f"Expected 1 OSM facility after deduplication, got {len(deduped)}"
    assert deduped[0]['id'] == 'osm_2'
    print("PASS: Deduplication dropped duplicate OSM facility and preserved registered DB partner!")

    print("\n--- 5. Testing OSM Down Case in /api/osm/nearest ---")
    # Simulate both local table and live Overpass failure
    with patch('osm_service.query_local_osm_table', return_value=[]), \
         patch('osm_service.fetch_live_overpass', return_value=(None, "Simulated 504 Gateway Timeout")), \
         patch.dict('osm_service._OSM_CACHE', {}, clear=True), \
         patch.dict('osm_service._STALE_CACHE', {}, clear=True):

        res_down = client.get('/api/osm/nearest?lat=19.6978&lng=72.7690&radius=10')
        assert res_down.status_code == 200
        body = res_down.get_json()
        assert body['hospitals'] == []
        assert 'warnings' in body
        assert len(body['warnings']) > 0
        print(f"PASS: When OSM is down, endpoint returned 200 with warnings: {body['warnings']}")

    print("\nALL API TESTS COMPLETED SUCCESSFULLY!")


if __name__ == '__main__':
    test_api()
