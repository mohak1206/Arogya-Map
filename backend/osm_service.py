"""
Arogya Map — OpenStreetMap (Overpass API) Facility Service
Fetches hospitals, clinics, and doctors within a given radius using Overpass QL.
Includes in-memory TTL caching, rate-limit friendliness, and robust error handling.
"""

import time
import requests

# In-memory cache: key -> {"timestamp": float, "data": list}
# Key: (round(lat, 2), round(lng, 2), int(radius_m))
_OSM_CACHE = {}
CACHE_TTL_SECONDS = 6 * 3600  # 6 hours

# User-Agent header following OSM Overpass usage policy
USER_AGENT = "ArogyaMap-HealthcareApp/1.0 (Emergency Healthcare Locator; https://github.com/mohak1206/Arogya-Map)"

# Multiple public Overpass endpoints for reliability
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter"
]

def _clean_cache():
    """Removes expired entries from in-memory cache."""
    now = time.time()
    expired_keys = [k for k, v in _OSM_CACHE.items() if now - v["timestamp"] > CACHE_TTL_SECONDS]
    for k in expired_keys:
        _OSM_CACHE.pop(k, None)

def fetch_osm_facilities(lat, lng, radius_m):
    """
    Query Overpass API for amenity=hospital|clinic|doctors within radius_m.
    Returns:
        tuple (facilities_list, warning_str or None)
    """
    _clean_cache()

    cache_key = (round(float(lat), 2), round(float(lng), 2), int(radius_m))
    now = time.time()
    if cache_key in _OSM_CACHE:
        cached = _OSM_CACHE[cache_key]
        if now - cached["timestamp"] < CACHE_TTL_SECONDS:
            return cached["data"], None

    # Overpass QL query: indexed tag unions for maximum speed and index utilization
    query = f"""
    [out:json][timeout:15];
    (
      node["amenity"="hospital"](around:{int(radius_m)},{lat},{lng});
      node["amenity"="clinic"](around:{int(radius_m)},{lat},{lng});
      node["amenity"="doctors"](around:{int(radius_m)},{lat},{lng});
      way["amenity"="hospital"](around:{int(radius_m)},{lat},{lng});
      way["amenity"="clinic"](around:{int(radius_m)},{lat},{lng});
      way["amenity"="doctors"](around:{int(radius_m)},{lat},{lng});
    );
    out center tags;
    """

    data = None
    last_error = None

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
    }

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            resp = requests.post(
                endpoint,
                data={"data": query},
                headers=headers,
                timeout=12
            )
            if resp.status_code == 200:
                data = resp.json()
                break
            else:
                last_error = f"HTTP {resp.status_code} from {endpoint}"
        except requests.exceptions.RequestException as e:
            last_error = str(e)
            continue

    if not data or "elements" not in data:
        warning = f"OpenStreetMap facilities unavailable ({last_error or 'no response'})."
        return [], warning

    facilities = []
    for item in data.get("elements", []):
        tags = item.get("tags", {})
        amenity = tags.get("amenity", "hospital").lower()

        # Extract coordinates (node has lat/lon, way has center.lat/lon)
        if item.get("type") == "node":
            item_lat = item.get("lat")
            item_lng = item.get("lon")
        else:
            center = item.get("center", {})
            item_lat = center.get("lat")
            item_lng = center.get("lon")

        if item_lat is None or item_lng is None:
            continue

        raw_name = tags.get("name") or tags.get("name:en")
        facility_type = "clinic" if amenity in ("clinic", "doctors") else "hospital"

        if not raw_name:
            raw_name = f"Unnamed {facility_type.capitalize()}"

        phone = (
            tags.get("phone")
            or tags.get("contact:phone")
            or tags.get("emergency:phone")
            or tags.get("contact:mobile")
            or None
        )

        facilities.append({
            "id": f"osm_{item.get('type')}_{item.get('id')}",
            "name": raw_name.strip(),
            "type": facility_type,
            "lat": float(item_lat),
            "lng": float(item_lng),
            "phone": phone.strip() if phone else None,
            "source": "osm",
            "live": False,
            "total_beds": 0,
            "available_beds": 0,
            "icu_beds": 0,
            "available_icu": 0,
            "ventilators": 0,
            "available_ventilators": 0,
            "address": tags.get("addr:full") or tags.get("addr:street") or ""
        })

    # Cache successful results
    _OSM_CACHE[cache_key] = {"timestamp": now, "data": facilities}
    return facilities, None
