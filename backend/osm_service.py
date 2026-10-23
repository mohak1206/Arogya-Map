"""
Arogya Map — OpenStreetMap Facility Service
Fetches hospitals, clinics, and doctors within a given radius.
Combines:
  1. High-speed local MySQL query on `osm_facilities` table (sub-millisecond indexed).
  2. Fallback to live OpenStreetMap Overpass API using multiple mirrors with priority order.
  3. 30-minute in-memory TTL caching and stale-while-error fallback.
  4. Full normalization into the Arogya Map facility schema.
  5. Deduplication against MySQL registered partner hospitals.
"""

import math
import re
import time
import requests
from config import Config

# In-memory cache: key -> {"timestamp": float, "data": list}
# Key: (round(lat, 2), round(lng, 2), radius_km, type_str)
_OSM_CACHE = {}
CACHE_TTL_SECONDS = 30 * 60  # 30 minutes

# Stale-while-error cache: stores last successful results by coordinates
_STALE_CACHE = {}

# User-Agent header following OSM Overpass usage policy
USER_AGENT = "ArogyaMap-HealthcareApp/1.0 (Emergency Healthcare Locator; https://github.com/mohak1206/Arogya-Map)"

# Mirror endpoints in priority order (read from config / .env)
OVERPASS_ENDPOINTS = Config.OVERPASS_ENDPOINTS or [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
]


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate the great-circle distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def clean_facility_name(name):
    """Normalize names for fuzzy deduplication."""
    return re.sub(r'[^a-z0-9]', '', (name or '').lower())


def build_address_from_tags(tags):
    """Build normalized address string from OpenStreetMap addr:* tags."""
    if tags.get("addr:full"):
        return tags["addr:full"].strip()
    
    parts = []
    hn = tags.get("addr:housenumber")
    st = tags.get("addr:street")
    sb = tags.get("addr:suburb") or tags.get("addr:neighbourhood")
    ct = tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:district")
    pc = tags.get("addr:postcode")

    if hn and st:
        parts.append(f"{hn} {st}")
    elif st:
        parts.append(st)
    if sb:
        parts.append(sb)
    if ct:
        parts.append(ct)
    if pc:
        parts.append(pc)

    return ", ".join(parts) if parts else ""


def _clean_cache():
    """Prunes expired entries from in-memory cache."""
    now = time.time()
    expired = [k for k, v in _OSM_CACHE.items() if now - v["timestamp"] > CACHE_TTL_SECONDS]
    for k in expired:
        _OSM_CACHE.pop(k, None)


def query_local_osm_table(cur, lat, lng, radius_km, facility_type='all'):
    """
    Query local MySQL `osm_facilities` table with bounding-box prefilter + SQL Haversine.
    Returns list of normalized dicts, or empty list if no local records exist.
    """
    if cur is None:
        return []

    try:
        # Bounding box prefilter
        delta_lat = radius_km / 111.045
        min_lat = lat - delta_lat
        max_lat = lat + delta_lat

        cos_lat = math.cos(math.radians(lat))
        if abs(cos_lat) > 1e-6:
            delta_lng = radius_km / (111.045 * cos_lat)
            min_lng = lng - abs(delta_lng)
            max_lng = lng + abs(delta_lng)
        else:
            min_lng = -180.0
            max_lng = 180.0

        type_condition = ""
        params = [lat, lat, lng, min_lat, max_lat, min_lng, max_lng]

        if facility_type == 'hospital':
            type_condition = "AND type = 'hospital'"
        elif facility_type in ('clinic', 'doctors'):
            type_condition = "AND type IN ('clinic', 'doctors')"

        params.append(radius_km)

        query = f"""
            SELECT id, osm_id, osm_type, name, type, address, phone, latitude, longitude,
                   (6371 * 2 * ASIN(SQRT(
                       POWER(SIN(RADIANS(latitude - %s) / 2), 2) +
                       COS(RADIANS(%s)) * COS(RADIANS(latitude)) *
                       POWER(SIN(RADIANS(longitude - %s) / 2), 2)
                   ))) AS distance_km
            FROM osm_facilities
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
              {type_condition}
            HAVING distance_km <= %s
            ORDER BY distance_km ASC
        """
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        if not rows:
            return []

        facilities = []
        for r in rows:
            ftype = "clinic" if r.get('type') in ('clinic', 'doctors') else "hospital"
            facilities.append({
                "id": f"osm_{r.get('osm_type', 'node')}_{r.get('osm_id', r['id'])}",
                "name": r['name'],
                "type": ftype,
                "lat": float(r['latitude']),
                "lng": float(r['longitude']),
                "distance_km": round(float(r['distance_km']), 2),
                "address": r.get('address') or '',
                "phone": r.get('phone') or None,
                "source": "osm",
                "live": False,
                "total_beds": None,
                "available_beds": None,
                "icu_beds": None,
                "available_icu": None,
                "ventilators": None,
                "available_ventilators": None
            })
        return facilities
    except Exception as e:
        # If table doesn't exist or query fails, fall through to live Overpass
        return []


def fetch_live_overpass(lat, lng, radius_m, facility_type='all'):
    """
    Query Overpass API with multiple mirrors, priority fallback, and 20s total budget.
    Uses lightweight query:
      [out:json][timeout:15];
      nwr["amenity"~"^(hospital|clinic|doctors)$"](around:RADIUS_METERS,LAT,LNG);
      out center tags;
    """
    query = f"""[out:json][timeout:15];
nwr["amenity"~"^(hospital|clinic|doctors)$"](around:{int(radius_m)},{lat},{lng});
out center tags;"""

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
    }

    start_time = time.time()
    total_budget = 20.0  # Total time budget across all mirrors
    last_error = None
    data = None

    for ep in OVERPASS_ENDPOINTS:
        elapsed = time.time() - start_time
        remaining = total_budget - elapsed
        if remaining <= 1.0:
            last_error = "Total Overpass time budget (20s) exceeded"
            break

        timeout_read = min(18.0, max(3.0, remaining))
        try:
            resp = requests.post(
                ep,
                data={"data": query},
                headers=headers,
                timeout=(3.0, timeout_read)
            )
            if resp.status_code == 200:
                data = resp.json()
                break
            else:
                last_error = f"HTTP {resp.status_code} from {ep}"
        except requests.exceptions.RequestException as e:
            last_error = f"{type(e).__name__} from {ep}"
            continue

    if not data or "elements" not in data:
        return None, last_error or "No response from Overpass mirrors"

    facilities = []
    for elem in data.get("elements", []):
        tags = elem.get("tags", {})
        amenity = tags.get("amenity", "hospital").lower()
        ftype = "clinic" if amenity in ("clinic", "doctors") else "hospital"

        if facility_type != 'all':
            if facility_type == 'hospital' and ftype != 'hospital':
                continue
            if facility_type in ('clinic', 'doctors') and ftype != 'clinic':
                continue

        elem_type = elem.get("type", "node")
        if elem_type == "node":
            item_lat = elem.get("lat")
            item_lng = elem.get("lon")
        else:
            center = elem.get("center", {})
            item_lat = center.get("lat")
            item_lng = center.get("lon")

        if item_lat is None or item_lng is None:
            continue

        raw_name = tags.get("name") or tags.get("name:en")
        if not raw_name:
            raw_name = f"Unnamed {ftype.capitalize()}"

        phone = (
            tags.get("phone")
            or tags.get("contact:phone")
            or tags.get("emergency:phone")
            or tags.get("contact:mobile")
            or None
        )
        address = build_address_from_tags(tags)

        dist = haversine_km(lat, lng, float(item_lat), float(item_lng))
        if dist > (radius_m / 1000.0):
            continue

        facilities.append({
            "id": f"osm_{elem_type}_{elem.get('id')}",
            "name": raw_name.strip(),
            "type": ftype,
            "lat": float(item_lat),
            "lng": float(item_lng),
            "distance_km": round(dist, 2),
            "address": address.strip(),
            "phone": phone.strip() if phone else None,
            "source": "osm",
            "live": False,
            "total_beds": None,
            "available_beds": None,
            "icu_beds": None,
            "available_icu": None,
            "ventilators": None,
            "available_ventilators": None
        })

    return facilities, None


def get_osm_facilities(lat, lng, radius_km, facility_type='all', db_cursor=None):
    """
    Primary interface for fetching OpenStreetMap facilities:
    1. Check local `osm_facilities` table in MySQL first.
    2. Check 30-minute in-memory cache.
    3. Query live Overpass mirrors with automatic fallback.
    4. Stale-while-error fallback if live queries fail.
    
    Returns:
        tuple (facilities_list, warning_str or None)
    """
    _clean_cache()

    # Step 1: Query local table first
    if db_cursor is not None:
        local_results = query_local_osm_table(db_cursor, lat, lng, radius_km, facility_type)
        if local_results:
            return local_results, None

    # Step 2: In-memory cache check
    cache_key = (round(float(lat), 2), round(float(lng), 2), round(float(radius_km), 1), facility_type)
    now = time.time()
    if cache_key in _OSM_CACHE:
        entry = _OSM_CACHE[cache_key]
        if now - entry["timestamp"] < CACHE_TTL_SECONDS:
            return entry["data"], None

    # Step 3: Live Overpass fetch
    radius_m = radius_km * 1000
    facilities, error_msg = fetch_live_overpass(lat, lng, radius_m, facility_type)

    if facilities is not None:
        # Cache successful result
        _OSM_CACHE[cache_key] = {"timestamp": now, "data": facilities}
        _STALE_CACHE[cache_key] = facilities
        return facilities, None

    # Step 4: Stale-while-error fallback
    if cache_key in _STALE_CACHE:
        return _STALE_CACHE[cache_key], f"Live OpenStreetMap mirrors unavailable ({error_msg}). Serving cached results."

    # Return empty list with clean warning
    return [], f"Some nearby OpenStreetMap facilities couldn't be loaded ({error_msg})."


def deduplicate_facilities(osm_facilities, db_facilities):
    """
    Deduplicate OSM facilities against registered database hospitals.
    Rules:
      - Drop OSM facility if within 100m of a DB hospital.
      - Drop OSM facility if within 150m of a DB hospital and names match/overlap.
      - Drop OSM facility if within 1.0 km of a DB hospital and clean names strongly match.
    Ensures DB partner hospitals with live bed counts always take precedence.
    """
    deduped = []

    for osm in osm_facilities:
        osm_lat = osm['lat']
        osm_lng = osm['lng']
        clean_osm = clean_facility_name(osm['name'])
        is_dup = False

        for db in db_facilities:
            dist = haversine_km(osm_lat, osm_lng, db['lat'], db['lng'])

            # Unconditional 100m proximity deduplication
            if dist <= 0.10:
                is_dup = True
                break

            clean_db = clean_facility_name(db['name'])
            # 150m proximity with fuzzy name overlap
            if dist <= 0.15:
                if len(clean_osm) >= 3 and len(clean_db) >= 3:
                    if clean_osm in clean_db or clean_db in clean_osm:
                        is_dup = True
                        break

            # 1.0 km proximity with high name similarity
            if dist <= 1.0:
                if len(clean_osm) >= 5 and len(clean_db) >= 5:
                    if clean_osm == clean_db or (clean_osm in clean_db and len(clean_osm) >= 8):
                        is_dup = True
                        break

        if not is_dup:
            deduped.append(osm)

    return deduped
