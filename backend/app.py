"""
Arogya Map — Flask Backend Application
Smart Emergency & Hospital Resource Management System

Algorithms implemented:
  - Haversine Formula     → Nearest hospital (Shortest Path)
  - Priority Queue Logic  → Emergency severity sorting
  - Greedy Bed Allocation → Assign best available hospital
  - MySQL Transactions    → Deadlock-safe booking
  - Flask Sessions        → Login state management
  - CORS                  → Frontend-backend communication
"""

import os
import math
import re
import queue
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, session, render_template, redirect, url_for, Response
from flask_cors import CORS
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config
from osm_service import get_osm_facilities, deduplicate_facilities, haversine_km
from broadcaster import broadcaster

# ── App Initialization ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), 'frontend')

app = Flask(
    __name__,
    template_folder=os.path.join(FRONTEND_DIR, 'templates'),
    static_folder=os.path.join(FRONTEND_DIR, 'static')
)
app.config.from_object(Config)
CORS(app, supports_credentials=True)
from database import mysql
mysql.init_app(app)

from site_config import init_site_config
init_site_config(app)



# ── Helper: Haversine Distance Formula ──────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great-circle distance between two points on Earth.
    Returns distance in kilometres.
    """
    R = 6371  # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Helper: Priority Queue Value ────────────────────────────────────────────
PRIORITY_ORDER = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}

def priority_score(priority_str):
    return PRIORITY_ORDER.get(priority_str, 1)


# ── Helper: Login Required Decorator ────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated


# ════════════════════════════════════════════════════════════════════════════
# PAGE ROUTES — Serve HTML templates
# ════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup')
def signup_page():
    return render_template('signup.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/hospitals')
def hospitals_page():
    return render_template('hospitals.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/profile')
def profile():
    return render_template('profile.html')

@app.route('/emergency')
def emergency():
    return render_template('emergency.html')

# ════════════════════════════════════════════════════════════════════════════
# AUTH API ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/register', methods=['POST'])
def register():
    """Register a new user. Password hashed with Werkzeug."""
    data = request.get_json()
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role     = data.get('role', 'user').strip().lower()

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    if role not in ('user', 'admin'):
        role = 'user'

    hashed_pw = generate_password_hash(password)

    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT id FROM users WHERE email = %s', (email,))
        if cur.fetchone():
            return jsonify({'error': 'Email already registered'}), 409

        cur.execute(
            'INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, %s)',
            (name, email, hashed_pw, role)
        )
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Account created successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    """Authenticate user and start Flask session."""
    data = request.get_json()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        cur.close()

        if not user or not check_password_hash(user['password'], password):
            return jsonify({'error': 'Invalid email or password'}), 401

        session['user_id']    = user['id']
        session['user_name']  = user['name']
        session['user_email'] = user['email']
        session['user_role']  = user['role']

        return jsonify({
            'message': 'Login successful',
            'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    """Clear Flask session on logout."""
    session.clear()
    return jsonify({'message': 'Logged out successfully'}), 200


@app.route('/api/user', methods=['GET'])
@login_required
def get_user():
    """Return currently logged-in user info from session."""
    return jsonify({
        'id':    session.get('user_id'),
        'name':  session.get('user_name'),
        'email': session.get('user_email'),
        'role':  session.get('user_role', 'user')
    }), 200


@app.route('/api/user/profile', methods=['GET'])
@login_required
def get_user_profile():
    """Full user profile with health summary and emergency history count."""
    try:
        cur = mysql.connection.cursor()
        # Get latest health data
        cur.execute(
            'SELECT * FROM health_data WHERE user_id = %s ORDER BY date DESC LIMIT 1',
            (session['user_id'],)
        )
        latest_health = cur.fetchone()

        # Get emergency request count
        cur.execute(
            'SELECT COUNT(*) as total FROM emergency_requests WHERE user_id = %s',
            (session['user_id'],)
        )
        emergency_count = cur.fetchone()

        # Get bed booking count
        cur.execute(
            'SELECT COUNT(*) as total FROM bed_bookings WHERE user_id = %s',
            (session['user_id'],)
        )
        booking_count = cur.fetchone()
        cur.close()

        if latest_health and latest_health.get('date'):
            latest_health['date'] = str(latest_health['date'])

        return jsonify({
            'user': {
                'id': session.get('user_id'),
                'name': session.get('user_name'),
                'email': session.get('user_email'),
                'role': session.get('user_role', 'user')
            },
            'latest_health': latest_health,
            'emergency_requests': emergency_count['total'] if emergency_count else 0,
            'bed_bookings': booking_count['total'] if booking_count else 0
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# HOSPITAL API ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/hospitals', methods=['GET'])
def get_hospitals():
    """Return all hospitals ordered by distance using Haversine formula."""
    try:
        # Default to Palghar center if no coords provided
        lat = request.args.get('lat', 19.6967)
        lng = request.args.get('lng', 72.7670)
        
        try:
            user_lat = float(lat)
            user_lng = float(lng)
        except ValueError:
            user_lat, user_lng = 19.6967, 72.7670

        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM hospitals')
        hospitals = cur.fetchall()
        cur.close()
        
        for h in hospitals:
            h['latitude'] = float(h['latitude'])
            h['longitude'] = float(h['longitude'])
            h['distance_km'] = round(
                haversine(user_lat, user_lng, h['latitude'], h['longitude']), 2
            )
            
        # Sort by distance
        hospitals_sorted = sorted(hospitals, key=lambda x: x['distance_km'])
        return jsonify({'hospitals': hospitals_sorted}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/hospitals/<int:hospital_id>', methods=['GET'])
def get_hospital(hospital_id):
    """Return details for a single hospital."""
    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM hospitals WHERE id = %s', (hospital_id,))
        hospital = cur.fetchone()
        cur.close()
        if not hospital:
            return jsonify({'error': 'Hospital not found'}), 404
        hospital['latitude'] = float(hospital['latitude'])
        hospital['longitude'] = float(hospital['longitude'])
        return jsonify({'hospital': hospital}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def validate_nearest_params(args):
    """
    Validates lat (-90..90), lng (-180..180), radius (1..30 km, default 10),
    and type in ('hospital', 'clinic', 'doctors', 'all', default 'all').
    Returns (lat, lng, radius, facility_type, error_str).
    """
    lat_val = args.get('lat')
    lng_val = args.get('lng')

    if lat_val is None or lng_val is None:
        return None, None, None, None, "Query parameters 'lat' and 'lng' are required."

    try:
        lat = float(lat_val)
        lng = float(lng_val)
    except (TypeError, ValueError):
        return None, None, None, None, "Invalid latitude/longitude: must be valid numbers."

    if not (-90.0 <= lat <= 90.0):
        return None, None, None, None, "Latitude must be between -90 and 90."

    if not (-180.0 <= lng <= 180.0):
        return None, None, None, None, "Longitude must be between -180 and 180."

    try:
        radius = float(args.get('radius', 10))
    except (TypeError, ValueError):
        return None, None, None, None, "Invalid radius: must be a positive number."

    if radius < 1 or radius > 30:
        return None, None, None, None, "Radius must be between 1 and 30 km."

    facility_type = args.get('type', 'all').strip().lower()
    if facility_type not in ('hospital', 'clinic', 'doctors', 'all'):
        return None, None, None, None, "Invalid type parameter. Allowed values: 'hospital', 'clinic', 'doctors', 'all'."

    return lat, lng, radius, facility_type, None


def query_db_hospitals(cur, lat, lng, radius, facility_type='all'):
    """
    Query registered MySQL partner hospitals within radius using
    a bounding-box prefilter + SQL Haversine formula.
    """
    if facility_type in ('clinic', 'doctors'):
        return []

    delta_lat = radius / 111.045
    min_lat = lat - delta_lat
    max_lat = lat + delta_lat

    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) > 1e-6:
        delta_lng = radius / (111.045 * cos_lat)
        min_lng = lng - abs(delta_lng)
        max_lng = lng + abs(delta_lng)
    else:
        min_lng = -180.0
        max_lng = 180.0

    query = """
        SELECT id, name, location, latitude, longitude,
               total_beds, available_beds, icu_beds, available_icu,
               ventilators, available_ventilators, contact, speciality,
               (6371 * 2 * ASIN(SQRT(
                   POWER(SIN(RADIANS(latitude - %s) / 2), 2) +
                   COS(RADIANS(%s)) * COS(RADIANS(latitude)) *
                   POWER(SIN(RADIANS(longitude - %s) / 2), 2)
               ))) AS distance_km
        FROM hospitals
        WHERE latitude BETWEEN %s AND %s
          AND longitude BETWEEN %s AND %s
        HAVING distance_km <= %s
        ORDER BY distance_km ASC
    """
    cur.execute(query, (lat, lat, lng, min_lat, max_lat, min_lng, max_lng, radius))
    rows = cur.fetchall()

    db_normalized = []
    for h in rows:
        db_normalized.append({
            "id": h['id'],
            "name": h['name'],
            "type": "hospital",
            "lat": float(h['latitude']),
            "lng": float(h['longitude']),
            "distance_km": round(float(h['distance_km']), 2),
            "phone": h.get('contact'),
            "source": "db",
            "live": True,
            "total_beds": int(h.get('total_beds', 0)),
            "available_beds": int(h.get('available_beds', 0)),
            "icu_beds": int(h.get('icu_beds', 0)),
            "available_icu": int(h.get('available_icu', 0)),
            "ventilators": int(h.get('ventilators', 0)),
            "available_ventilators": int(h.get('available_ventilators', 0)),
            "location": h.get('location', ''),
            "speciality": h.get('speciality', 'General')
        })
    return db_normalized


@app.route('/api/hospitals/nearest', methods=['GET'])
def get_nearest_hospitals():
    """
    Find nearest registered partner hospitals from MySQL within specified radius (km).
    Returns instantly without blocking on external services (include_osm=false by default).
    If include_osm=true is explicitly requested, merges OSM facilities for backwards compatibility.
    """
    lat, lng, radius, facility_type, err = validate_nearest_params(request.args)
    if err:
        return jsonify({'error': err}), 400

    include_osm_param = request.args.get('include_osm', 'false').strip().lower()
    include_osm = include_osm_param in ('true', '1', 'yes')

    warnings = []
    db_normalized = []
    try:
        cur = mysql.connection.cursor()
        db_normalized = query_db_hospitals(cur, lat, lng, radius, facility_type)
        cur.close()
    except Exception as e:
        warnings.append(f"Database hospital query error: {str(e)}")

    if not include_osm:
        result = {
            'hospitals': db_normalized,
            'count': len(db_normalized),
            'user_lat': lat,
            'user_lng': lng,
            'radius': radius,
            'type': facility_type
        }
        if warnings:
            result['warnings'] = warnings
        return jsonify(result), 200

    # Backwards compatibility: include_osm=true requested
    osm_deduped = []
    try:
        cur = mysql.connection.cursor()
        osm_facilities, osm_warn = get_osm_facilities(lat, lng, radius, facility_type, db_cursor=cur)
        cur.close()
        if osm_warn:
            warnings.append(osm_warn)
        osm_deduped = deduplicate_facilities(osm_facilities, db_normalized)
    except Exception as e:
        warnings.append(f"OpenStreetMap facilities error: {str(e)}")

    merged = db_normalized + osm_deduped
    merged.sort(key=lambda x: x['distance_km'])

    result = {
        'hospitals': merged,
        'count': len(merged),
        'user_lat': lat,
        'user_lng': lng,
        'radius': radius,
        'type': facility_type
    }
    if warnings:
        result['warnings'] = warnings
    return jsonify(result), 200


@app.route('/api/osm/nearest', methods=['GET'])
def get_nearest_osm():
    """
    Returns healthcare facilities (hospitals, clinics, doctors) from OpenStreetMap.
    Queries local MySQL table first, falls back to live Overpass mirrors,
    and deduplicates against registered partner hospitals.
    """
    lat, lng, radius, facility_type, err = validate_nearest_params(request.args)
    if err:
        return jsonify({'error': err}), 400

    warnings = []
    db_hospitals = []
    osm_deduped = []

    try:
        cur = mysql.connection.cursor()
        # Query registered DB hospitals in radius to deduplicate against them
        db_hospitals = query_db_hospitals(cur, lat, lng, radius, 'all')

        # Query OSM facilities (local table first, then Overpass fallback)
        osm_facilities, osm_warn = get_osm_facilities(lat, lng, radius, facility_type, db_cursor=cur)
        cur.close()

        if osm_warn:
            warnings.append(osm_warn)

        osm_deduped = deduplicate_facilities(osm_facilities, db_hospitals)
        osm_deduped.sort(key=lambda x: x['distance_km'])
    except Exception as e:
        warnings.append(f"Failed to fetch OpenStreetMap facilities: {str(e)}")

    result = {
        'hospitals': osm_deduped,
        'count': len(osm_deduped),
        'user_lat': lat,
        'user_lng': lng,
        'radius': radius,
        'type': facility_type
    }
    if warnings:
        result['warnings'] = warnings

    return jsonify(result), 200


@app.route('/api/hospitals/stream', methods=['GET'])
def hospital_bed_stream():
    """
    Server-Sent Events (SSE) endpoint streaming real-time hospital bed changes.
    Clients update the DOM without needing a full refetch.
    """
    def event_stream():
        q = broadcaster.listen()
        # Initial connect handshake
        yield f"data: {{\"event\": \"connected\"}}\n\n"
        try:
            while True:
                try:
                    payload = q.get(timeout=20)
                    yield f"data: {payload}\n\n"
                except queue.Empty:
                    # Heartbeat comment to keep HTTP connection alive
                    yield ": keepalive\n\n"
        except GeneratorExit:
            broadcaster.remove(q)

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.route('/api/hospitals/search', methods=['GET'])
def search_hospitals():
    """Search hospitals by name or city."""
    query = request.args.get('q', '').strip()
    if not query:
        return get_hospitals()

    try:
        cur = mysql.connection.cursor()
        search_term = f'%{query}%'
        cur.execute(
            'SELECT * FROM hospitals WHERE name LIKE %s OR location LIKE %s OR speciality LIKE %s ORDER BY name',
            (search_term, search_term, search_term)
        )
        hospitals = cur.fetchall()
        cur.close()

        for h in hospitals:
            h['latitude'] = float(h['latitude'])
            h['longitude'] = float(h['longitude'])

        return jsonify({'hospitals': hospitals}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/hospitals/<int:hospital_id>/request-bed', methods=['POST'])
@login_required
def request_bed(hospital_id):
    """
    Book a bed at a specific hospital.
    Uses MySQL Transaction for atomic bed decrement (Deadlock Prevention).
    """
    data = request.get_json()
    patient_name = data.get('patient_name', '').strip()
    bed_type = data.get('bed_type', 'general')

    if not patient_name:
        return jsonify({'error': 'Patient name is required'}), 400

    if bed_type not in ('general', 'icu'):
        return jsonify({'error': 'Invalid bed type. Use "general" or "icu"'}), 400

    try:
        cur = mysql.connection.cursor()
        mysql.connection.begin()

        try:
            # Lock the row
            cur.execute('SELECT * FROM hospitals WHERE id = %s FOR UPDATE', (hospital_id,))
            hospital = cur.fetchone()

            if not hospital:
                mysql.connection.rollback()
                cur.close()
                return jsonify({'error': 'Hospital not found'}), 404

            if bed_type == 'general':
                if hospital['available_beds'] < 1:
                    mysql.connection.rollback()
                    cur.close()
                    return jsonify({'error': 'No general beds available at this hospital'}), 409
                cur.execute(
                    'UPDATE hospitals SET available_beds = available_beds - 1 WHERE id = %s',
                    (hospital_id,)
                )
            else:  # ICU
                if hospital['available_icu'] < 1:
                    mysql.connection.rollback()
                    cur.close()
                    return jsonify({'error': 'No ICU beds available at this hospital'}), 409
                cur.execute(
                    'UPDATE hospitals SET available_icu = available_icu - 1 WHERE id = %s',
                    (hospital_id,)
                )

            # Insert booking record
            cur.execute(
                '''INSERT INTO bed_bookings (user_id, hospital_id, patient_name, bed_type, status)
                   VALUES (%s, %s, %s, %s, 'booked')''',
                (session['user_id'], hospital_id, patient_name, bed_type)
            )
            mysql.connection.commit()

            # Broadcast updated bed counts to all connected clients
            cur.execute('SELECT available_beds, total_beds, available_icu, available_ventilators FROM hospitals WHERE id = %s', (hospital_id,))
            updated_h = cur.fetchone()
            if updated_h:
                broadcaster.broadcast({
                    'event': 'bed_update',
                    'hospital_id': hospital_id,
                    'available_beds': updated_h['available_beds'],
                    'total_beds': updated_h['total_beds'],
                    'available_icu': updated_h['available_icu'],
                    'available_ventilators': updated_h['available_ventilators']
                })
        except Exception as tx_err:
            mysql.connection.rollback()
            cur.close()
            return jsonify({'error': f'Transaction failed: {str(tx_err)}'}), 500

        cur.close()
        return jsonify({
            'message': f'Bed booked successfully at {hospital["name"]}!',
            'hospital': hospital['name'],
            'bed_type': bed_type
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# EMERGENCY REQUEST ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/emergency', methods=['POST'])
@login_required
def create_emergency():
    """
    Create an emergency request and assign the best available hospital.

    Algorithms:
      - Priority Queue: Critical requests get highest urgency score.
      - Greedy Bed Allocation: Pick hospital with best score.
      - MySQL Transactions: Atomic bed decrement (Deadlock Prevention).
    """
    data = request.get_json()
    patient_name = data.get('patient_name', '').strip()
    priority     = data.get('priority', 'medium')
    description  = data.get('description', '').strip()
    user_lat     = data.get('lat', 28.6139)
    user_lng     = data.get('lng', 77.2090)

    if not patient_name or priority not in PRIORITY_ORDER:
        return jsonify({'error': 'Patient name and valid priority are required'}), 400

    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM hospitals WHERE available_beds > 0')
        available_hospitals = cur.fetchall()

        if not available_hospitals:
            cur.close()
            return jsonify({'error': 'No hospitals with available beds right now'}), 503

        for h in available_hospitals:
            h['latitude'] = float(h['latitude'])
            h['longitude'] = float(h['longitude'])
            h['distance_km'] = haversine(
                float(user_lat), float(user_lng),
                h['latitude'], h['longitude']
            )

        prio = priority_score(priority)
        def score(h):
            return (h['available_beds'] * prio) / (h['distance_km'] + 0.1)

        best = max(available_hospitals, key=score)
        assigned_hospital_id   = best['id']
        assigned_hospital_name = best['name']

        mysql.connection.begin()
        try:
            cur.execute(
                'SELECT available_beds FROM hospitals WHERE id = %s FOR UPDATE',
                (assigned_hospital_id,)
            )
            locked = cur.fetchone()
            if locked['available_beds'] < 1:
                mysql.connection.rollback()
                cur.close()
                return jsonify({'error': 'Selected hospital just became full. Please retry.'}), 409

            cur.execute(
                'UPDATE hospitals SET available_beds = available_beds - 1 WHERE id = %s',
                (assigned_hospital_id,)
            )
            cur.execute(
                '''INSERT INTO emergency_requests
                   (user_id, hospital_id, patient_name, description, priority, status)
                   VALUES (%s, %s, %s, %s, %s, 'assigned')''',
                (session['user_id'], assigned_hospital_id, patient_name, description, priority)
            )
            mysql.connection.commit()

            # Broadcast bed update for assigned hospital
            cur.execute('SELECT available_beds, total_beds, available_icu, available_ventilators FROM hospitals WHERE id = %s', (assigned_hospital_id,))
            updated_assigned = cur.fetchone()
            if updated_assigned:
                broadcaster.broadcast({
                    'event': 'bed_update',
                    'hospital_id': assigned_hospital_id,
                    'available_beds': updated_assigned['available_beds'],
                    'total_beds': updated_assigned['total_beds'],
                    'available_icu': updated_assigned['available_icu'],
                    'available_ventilators': updated_assigned['available_ventilators']
                })
        except Exception as tx_err:
            mysql.connection.rollback()
            cur.close()
            return jsonify({'error': f'Transaction failed: {str(tx_err)}'}), 500

        cur.close()
        return jsonify({
            'message': 'Emergency request submitted and hospital assigned!',
            'assigned_hospital': assigned_hospital_name,
            'hospital_id': assigned_hospital_id,
            'priority': priority,
            'distance_km': round(best['distance_km'], 2),
            'hospital_contact': best.get('contact', 'N/A'),
            'hospital_location': best.get('location', '')
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/emergency/history', methods=['GET'])
@login_required
def emergency_history():
    """Get user's past emergency requests."""
    try:
        cur = mysql.connection.cursor()
        cur.execute(
            '''SELECT er.*, h.name as hospital_name, h.location as hospital_location, h.contact as hospital_contact
               FROM emergency_requests er
               LEFT JOIN hospitals h ON er.hospital_id = h.id
               WHERE er.user_id = %s
               ORDER BY er.requested_at DESC
               LIMIT 20''',
            (session['user_id'],)
        )
        requests = cur.fetchall()
        cur.close()

        for r in requests:
            if r.get('requested_at'):
                r['requested_at'] = str(r['requested_at'])

        return jsonify({'requests': requests}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# HEALTH DATA ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/health', methods=['GET'])
@login_required
def get_health():
    """Return last 7 days of health data for the logged-in user."""
    try:
        cur = mysql.connection.cursor()
        cur.execute(
            '''SELECT * FROM health_data
               WHERE user_id = %s
               ORDER BY date DESC
               LIMIT 7''',
            (session['user_id'],)
        )
        rows = cur.fetchall()
        cur.close()

        for row in rows:
            if row.get('date'):
                row['date'] = str(row['date'])
            if row.get('sleep_hours'):
                row['sleep_hours'] = float(row['sleep_hours'])
            if row.get('screen_time_hours'):
                row['screen_time_hours'] = float(row['screen_time_hours'])

        return jsonify({'health_data': rows}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['POST'])
@login_required
def add_health():
    """Insert a new daily health entry for the logged-in user."""
    data = request.get_json()
    try:
        cur = mysql.connection.cursor()
        cur.execute(
            '''INSERT INTO health_data
               (user_id, date, stress_level, productivity_score, sleep_hours, steps, screen_time_hours)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE
               stress_level = VALUES(stress_level),
               productivity_score = VALUES(productivity_score),
               sleep_hours = VALUES(sleep_hours),
               steps = VALUES(steps),
               screen_time_hours = VALUES(screen_time_hours)''',
            (
                session['user_id'],
                data.get('date', datetime.today().strftime('%Y-%m-%d')),
                data.get('stress_level', 0),
                data.get('productivity_score', 0),
                data.get('sleep_hours', 0),
                data.get('steps', 0),
                data.get('screen_time_hours', 0)
            )
        )
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Health entry saved successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# CONTACT ROUTE (hardened)
# ════════════════════════════════════════════════════════════════════════════

import time as _time
import logging

_contact_rate = {}  # IP -> list of timestamps
_CONTACT_LIMIT = 5
_CONTACT_WINDOW = 3600  # 1 hour
_EMAIL_RE = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,255}\.[a-zA-Z]{2,}$')


@app.route('/api/contact', methods=['POST'])
def contact_submit():
    """Save a contact form message to the database."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({'success': False, 'errors': {'form': 'Invalid request body.'}}), 400

    # ── Honeypot ────────────────────────────────────────────
    if data.get('website', '').strip():
        return jsonify({'success': True}), 200  # silent discard

    # ── Rate limit ─────────────────────────────────────────
    client_ip = request.remote_addr or '0.0.0.0'
    now = _time.time()
    hits = _contact_rate.get(client_ip, [])
    hits = [t for t in hits if now - t < _CONTACT_WINDOW]
    if len(hits) >= _CONTACT_LIMIT:
        return jsonify({
            'success': False,
            'errors': {'form': 'Too many messages. Please try again in an hour.'}
        }), 429

    # ── Trim & validate ────────────────────────────────────
    name    = data.get('name', '').strip()
    email   = data.get('email', '').strip()
    message = data.get('message', '').strip()

    errors = {}
    if len(name) < 2 or len(name) > 100:
        errors['name'] = 'Name must be between 2 and 100 characters.'
    if not _EMAIL_RE.match(email) or len(email) > 100:
        errors['email'] = 'Please enter a valid email address (max 100 characters).'
    if len(message) < 10 or len(message) > 2000:
        errors['message'] = 'Message must be between 10 and 2,000 characters.'

    if errors:
        return jsonify({'success': False, 'errors': errors}), 400

    # ── Insert ─────────────────────────────────────────────
    try:
        cur = mysql.connection.cursor()
        cur.execute(
            'INSERT INTO contact_messages (name, email, message) VALUES (%s, %s, %s)',
            (name, email, message)
        )
        mysql.connection.commit()
        cur.close()

        hits.append(now)
        _contact_rate[client_ip] = hits

        return jsonify({'success': True}), 201
    except Exception:
        logging.exception('Contact form save failed')
        return jsonify({
            'success': False,
            'errors': {'form': 'Something went wrong. Please try again later.'}
        }), 500


# ════════════════════════════════════════════════════════════════════════════
# Run Application
# ════════════════════════════════════════════════════════════════════════════

from admin_routes import admin_bp, admin_api_bp
app.register_blueprint(admin_bp, url_prefix='/admin')
app.register_blueprint(admin_api_bp, url_prefix='/api/admin')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
