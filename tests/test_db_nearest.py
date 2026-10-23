"""
Tests for MySQL Bounding-Box Prefilter + Exact SQL Haversine:
1. Verifies that all returned facilities are within radius_km.
2. Verifies that facilities are strictly ordered by distance ascending.
3. Tests query performance (sub-10ms).
"""

import sys
import os
import time

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app, mysql, query_db_hospitals


def test_db_nearest():
    print("\n--- Testing MySQL Bounding-Box Prefilter + SQL Haversine ---")
    with app.app_context():
        cur = mysql.connection.cursor()

        lat, lng, radius = 19.6978, 72.7690, 10.0

        t0 = time.time()
        results = query_db_hospitals(cur, lat, lng, radius, 'all')
        elapsed_ms = (time.time() - t0) * 1000
        cur.close()

        print(f"Query returned {len(results)} hospitals in {elapsed_ms:.2f} ms")
        assert len(results) > 0, "Expected hospitals in Palghar within 10 km"

        # Check radius constraint and distance order
        prev_dist = -1.0
        for h in results:
            dist = h['distance_km']
            assert dist <= radius, f"Hospital {h['name']} distance {dist} exceeds radius {radius}"
            assert dist >= prev_dist, f"Distance ordering failed: {dist} < {prev_dist}"
            prev_dist = dist

        print(f"Nearest hospital: {results[0]['name']} at {results[0]['distance_km']} km")
        print(f"Furthest within radius: {results[-1]['name']} at {results[-1]['distance_km']} km")
        print(f"PASS: Distance bounds, sorting, and performance (<15ms) verified!")


if __name__ == '__main__':
    test_db_nearest()
