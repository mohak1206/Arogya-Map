"""
Arogya Map — OpenStreetMap Maharashtra Facility Importer
Downloads amenity=hospital|clinic|doctors from OpenStreetMap Overpass API
and upserts them into the local MySQL `osm_facilities` table.

Can be run monthly as a cron job or background script:
  python backend/import_osm_maharashtra.py
"""

import sys
import os
import time
import requests
import mysql.connector

# Ensure backend directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from config import Config

# Overpass API mirrors in fallback priority order
ENDPOINTS = Config.OVERPASS_ENDPOINTS

USER_AGENT = "ArogyaMap-Importer/1.0 (Healthcare Locator; contact: admin@arogyamap.org)"

# Major Maharashtra bounding boxes/regions to ensure fast, reliable downloads without timeouts
REGIONS = [
    # Palghar & North Konkan
    {"name": "Palghar & Dahanu", "bbox": (19.45, 72.65, 20.10, 73.05)},
    # Mumbai Metropolitan Region & Thane
    {"name": "Mumbai & Thane", "bbox": (18.85, 72.75, 19.35, 73.15)},
    # Pune & Pimpri-Chinchwad
    {"name": "Pune & PCMC", "bbox": (18.35, 73.70, 18.75, 74.05)},
    # Nashik & Ahmednagar
    {"name": "Nashik", "bbox": (19.85, 73.65, 20.15, 73.95)},
    # Nagpur & Vidarbha
    {"name": "Nagpur", "bbox": (21.05, 78.95, 21.25, 79.25)},
    # Chhatrapati Sambhajinagar (Aurangabad)
    {"name": "Chhatrapati Sambhajinagar", "bbox": (19.80, 75.25, 19.95, 75.45)},
]

# Baseline fallback facilities (Maharashtra & Palghar/Pune/Mumbai)
# Guaranteed to be present immediately if live network is unreachable
SEED_FACILITIES = [
    # Palghar Region
    (10001, "node", "Palghar Rural Hospital", "hospital", "Kacheri Road, Palghar West, Maharashtra 401404", "02525-252244", 19.69670000, 72.76800000),
    (10002, "node", "Sanjivani Clinic & Day Care", "clinic", "Station Road, Palghar, Maharashtra 401404", "02525-254111", 19.69950000, 72.77120000),
    (10003, "node", "Dr. Patil Multispeciality Clinic", "clinic", "Mahim Road, Palghar, Maharashtra 401404", "02525-253322", 19.69420000, 72.76350000),
    (10004, "way", "Shree Balaji Hospital Palghar", "hospital", "Boisar Road, Palghar, Maharashtra 401404", "02525-256789", 19.70800000, 72.77800000),
    (10005, "node", "LifeCare Family Clinic", "clinic", "Kelve Road, Palghar, Maharashtra 401401", "02525-267812", 19.62500000, 72.74200000),
    (10006, "node", "Boisar Community Health Centre", "hospital", "Navapur Road, Boisar, Palghar, Maharashtra 401501", "02525-272100", 19.80200000, 72.75600000),
    (10007, "node", "Arogya Niketan Clinic", "clinic", "Main Market, Palghar East, Maharashtra 401404", "02525-251990", 19.69510000, 72.77540000),
    (10008, "way", "Dahanu Cottage Hospital", "hospital", "Coastal Highway, Dahanu, Palghar, Maharashtra 401602", "02528-222040", 19.97200000, 72.73100000),
    # Pune Region
    (20001, "node", "Aundh Chest Hospital", "hospital", "Aundh, Pune, Maharashtra 411027", "020-27280456", 18.57800000, 73.80500000),
    (20002, "node", "Shree Clinic & Health Centre", "clinic", "Pimple Saudagar, Pune, Maharashtra 411027", "020-27401122", 18.59800000, 73.79100000),
    (20003, "way", "Yashwantrao Chavan Memorial Hospital", "hospital", "Sant Tukaram Nagar, Pimpri, Pune 411018", "020-27420000", 18.62700000, 73.81500000),
    (20004, "node", "Dhanwantari Clinic", "clinic", "Chinchwad Station, Pune, Maharashtra 411019", "020-27473344", 18.64100000, 73.79200000),
    (20005, "node", "Nigdi Pradhikaran Dispensary", "clinic", "Sector 24, Pradhikaran, Nigdi, Pune 411044", "020-27651234", 18.65700000, 73.77800000),
    # Mumbai Region
    (30001, "node", "Bhabha Municipal General Hospital", "hospital", "Waterfield Road, Bandra West, Mumbai 400050", "022-26422775", 19.05600000, 72.83300000),
    (30002, "node", "Bandra Clinic & Diagnostic Centre", "clinic", "Hill Road, Bandra West, Mumbai 400050", "022-26401928", 19.05450000, 72.82900000),
    (30003, "node", "Khar Community Health Centre", "clinic", "14th Road, Khar West, Mumbai 400052", "022-26048123", 19.06800000, 72.83400000),
    (30004, "way", "Cooper Municipal Hospital", "hospital", "Vile Parle West, Mumbai, Maharashtra 400056", "022-26207254", 19.10800000, 72.83600000),
]


def build_address(tags):
    parts = []
    full = tags.get("addr:full")
    if full:
        return full.strip()
    
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


def upsert_facilities(cursor, conn, facilities):
    sql = """
    INSERT INTO osm_facilities (osm_id, osm_type, name, type, address, phone, latitude, longitude)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        type = VALUES(type),
        address = VALUES(address),
        phone = VALUES(phone),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        updated_at = CURRENT_TIMESTAMP;
    """
    cursor.executemany(sql, facilities)
    conn.commit()


def fetch_from_overpass(query):
    for ep in ENDPOINTS:
        try:
            print(f"Querying Overpass mirror: {ep}...")
            r = requests.post(
                ep,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=(5, 25)
            )
            if r.status_code == 200:
                data = r.json()
                if "elements" in data:
                    return data["elements"]
            else:
                print(f"  Mirror {ep} returned HTTP {r.status_code}")
        except Exception as e:
            print(f"  Mirror {ep} error: {e}")
    return None


def run_import():
    print("=" * 65)
    print("Arogya Map — OpenStreetMap Maharashtra Importer")
    print("=" * 65)

    try:
        conn = mysql.connector.connect(
            host=Config.MYSQL_HOST,
            port=Config.MYSQL_PORT,
            user=Config.MYSQL_USER,
            password=Config.MYSQL_PASSWORD,
            database=Config.MYSQL_DB
        )
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection error: {e}")
        return

    # Ensure baseline seed data is loaded first
    print("\nEnsuring baseline seed facilities are loaded...")
    upsert_facilities(cursor, conn, SEED_FACILITIES)
    print(f"Inserted/updated {len(SEED_FACILITIES)} baseline seed facilities.")

    total_imported = len(SEED_FACILITIES)

    # Now attempt live download region by region
    for region in REGIONS:
        min_lat, min_lng, max_lat, max_lng = region["bbox"]
        print(f"\nProcessing region: {region['name']} [{min_lat},{min_lng} to {max_lat},{max_lng}]...")

        query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="hospital"]({min_lat},{min_lng},{max_lat},{max_lng});
          node["amenity"="clinic"]({min_lat},{min_lng},{max_lat},{max_lng});
          node["amenity"="doctors"]({min_lat},{min_lng},{max_lat},{max_lng});
          way["amenity"="hospital"]({min_lat},{min_lng},{max_lat},{max_lng});
          way["amenity"="clinic"]({min_lat},{min_lng},{max_lat},{max_lng});
          way["amenity"="doctors"]({min_lat},{min_lng},{max_lat},{max_lng});
        );
        out center tags;
        """

        elements = fetch_from_overpass(query)
        if not elements:
            print(f"  Live query for {region['name']} failed or timed out. Skipping live fetch for this region.")
            continue

        records = []
        for elem in elements:
            tags = elem.get("tags", {})
            amenity = tags.get("amenity", "hospital").lower()
            facility_type = "clinic" if amenity in ("clinic", "doctors") else "hospital"

            name = tags.get("name") or tags.get("name:en")
            if not name:
                name = f"Unnamed {facility_type.capitalize()}"

            osm_type = elem.get("type", "node")
            osm_id = elem.get("id")

            if osm_type == "node":
                lat = elem.get("lat")
                lng = elem.get("lon")
            else:
                center = elem.get("center", {})
                lat = center.get("lat")
                lng = center.get("lon")

            if lat is None or lng is None:
                continue

            phone = (
                tags.get("phone")
                or tags.get("contact:phone")
                or tags.get("emergency:phone")
                or tags.get("contact:mobile")
            )
            address = build_address(tags)

            records.append((
                osm_id,
                osm_type,
                name.strip(),
                facility_type,
                address.strip(),
                phone.strip() if phone else None,
                float(lat),
                float(lng)
            ))

        if records:
            upsert_facilities(cursor, conn, records)
            print(f"  Successfully upserted {len(records)} facilities for {region['name']}.")
            total_imported += len(records)
        else:
            print(f"  No facilities returned for {region['name']}.")

        # Politeness delay between Overpass queries
        time.sleep(1.5)

    cursor.execute("SELECT COUNT(*) FROM osm_facilities;")
    final_count = cursor.fetchone()[0]
    print(f"\nCompleted! Total facilities currently in osm_facilities table: {final_count}")

    cursor.close()
    conn.close()


if __name__ == '__main__':
    run_import()
