"""
HealMaps — Flask Backend Application
Smart Emergency & Hospital Resource Management System

Algorithms implemented:
  - Haversine Formula     → Nearest hospital (Shortest Path / AOA)
  - Priority Queue Logic  → Emergency severity sorting
  - Greedy Bed Allocation → Assign best available hospital
  - MySQL Transactions    → Deadlock-safe booking (OS: Deadlock Prevention)
  - Flask Sessions        → Login state (OS: Process Scheduling)
  - CORS                  → Frontend-backend comms (CN: Client-Server)
"""

import math
from datetime import datetime
from flask import Flask, request, jsonify, session, render_template, redirect, url_for
from flask_cors import CORS
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config

# ── App Initialization ──────────────────────────────────────────────────────
app = Flask(__name__)
app.config.from_object(Config)
CORS(app, supports_credentials=True)   # CN: Client-Server architecture
mysql = MySQL(app)

# ── Helper: Haversine Distance Formula (AOA: Shortest Path) ─────────────────
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

# ── Helper: Priority Queue Value (AOA: Priority Scheduling) ─────────────────
PRIORITY_ORDER = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}

def priority_score(priority_str):
    return PRIORITY_ORDER.get(priority_str, 1)

# ── Helper: Login Required ───────────────────────────────────────────────────
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated

# ════════════════════════════════════════════════════════════════════════════
# PAGE ROUTES — Serve HTML templates via Flask
# ════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup')
def signup():
    return render_template('signup.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

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

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    hashed_pw = generate_password_hash(password)

    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT id FROM users WHERE email = %s', (email,))
        if cur.fetchone():
            return jsonify({'error': 'Email already registered'}), 409

        cur.execute(
            'INSERT INTO users (name, email, password) VALUES (%s, %s, %s)',
            (name, email, hashed_pw)
        )
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Account created successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    """Authenticate user and start Flask session (OS: Process Scheduling)."""
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

        # Start session
        session['user_id']   = user['id']
        session['user_name']  = user['name']
        session['user_email'] = user['email']

        return jsonify({
            'message': 'Login successful',
            'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}
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
        'email': session.get('user_email')
    }), 200

# ════════════════════════════════════════════════════════════════════════════
# HOSPITAL API ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/hospitals', methods=['GET'])
def get_hospitals():
    """Return all hospitals with full bed availability data."""
    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM hospitals ORDER BY name')
        hospitals = cur.fetchall()
        cur.close()
        return jsonify({'hospitals': hospitals}), 200
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
        return jsonify({'hospital': hospital}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/hospitals/nearest', methods=['GET'])
def get_nearest_hospitals():
    """
    Find nearest hospitals using the Haversine formula (AOA: Shortest Path).
    Returns all hospitals sorted by distance from the user's location.
    """
    try:
        lat = float(request.args.get('lat', 28.6139))   # Default: Delhi
        lng = float(request.args.get('lng', 77.2090))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid latitude/longitude'}), 400

    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM hospitals')
        hospitals = cur.fetchall()
        cur.close()

        # Compute distance for each hospital and attach it
        for h in hospitals:
            h['distance_km'] = round(
                haversine(lat, lng, float(h['latitude']), float(h['longitude'])), 2
            )

        # Sort by distance (Greedy: nearest first)
        hospitals_sorted = sorted(hospitals, key=lambda x: x['distance_km'])

        return jsonify({'hospitals': hospitals_sorted, 'user_lat': lat, 'user_lng': lng}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ════════════════════════════════════════════════════════════════════════════
# EMERGENCY REQUEST ROUTE
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/emergency', methods=['POST'])
@login_required
def create_emergency():
    """
    Create an emergency request and assign the best available hospital.

    Algorithms:
      - Priority Queue: Critical requests get highest urgency score.
      - Greedy Bed Allocation: Among hospitals sorted by priority-weighted
        bed availability, pick the one with the most available beds.
      - MySQL Transactions: Atomic bed decrement to prevent double-booking
        (OS: Deadlock Prevention).
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

        # Fetch all hospitals with available beds
        cur.execute('SELECT * FROM hospitals WHERE available_beds > 0')
        available_hospitals = cur.fetchall()

        if not available_hospitals:
            cur.close()
            return jsonify({'error': 'No hospitals with available beds right now'}), 503

        # Compute distance for each hospital
        for h in available_hospitals:
            h['distance_km'] = haversine(
                float(user_lat), float(user_lng),
                float(h['latitude']), float(h['longitude'])
            )

        # Greedy + Priority queue weighted scoring:
        #   higher priority → smaller effective distance (favour speed for critical cases)
        prio = priority_score(priority)
        def score(h):
            # Greedy: maximise available beds, weighted by inverse distance, boosted by priority
            return (h['available_beds'] * prio) / (h['distance_km'] + 0.1)

        best = max(available_hospitals, key=score)
        assigned_hospital_id   = best['id']
        assigned_hospital_name = best['name']

        # MySQL TRANSACTION: atomic bed decrement (OS: Deadlock Prevention)
        mysql.connection.begin()
        try:
            # Lock the row to prevent concurrent double-booking
            cur.execute(
                'SELECT available_beds FROM hospitals WHERE id = %s FOR UPDATE',
                (assigned_hospital_id,)
            )
            locked = cur.fetchone()
            if locked['available_beds'] < 1:
                mysql.connection.rollback()
                cur.close()
                return jsonify({'error': 'Selected hospital just became full. Please retry.'}), 409

            # Decrement bed count
            cur.execute(
                'UPDATE hospitals SET available_beds = available_beds - 1 WHERE id = %s',
                (assigned_hospital_id,)
            )

            # Insert emergency request
            cur.execute(
                '''INSERT INTO emergency_requests
                   (user_id, hospital_id, patient_name, description, priority, status)
                   VALUES (%s, %s, %s, %s, %s, 'assigned')''',
                (session['user_id'], assigned_hospital_id, patient_name, description, priority)
            )
            mysql.connection.commit()
        except Exception as tx_err:
            mysql.connection.rollback()
            cur.close()
            return jsonify({'error': f'Transaction failed: {str(tx_err)}'}), 500

        cur.close()
        return jsonify({
            'message': 'Emergency request submitted and hospital assigned!',
            'assigned_hospital': assigned_hospital_name,
            'priority': priority,
            'distance_km': round(best['distance_km'], 2)
        }), 201

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

        # Convert date objects to strings for JSON serialization
        for row in rows:
            if row.get('date'):
                row['date'] = str(row['date'])

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
               VALUES (%s, %s, %s, %s, %s, %s, %s)''',
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
        return jsonify({'message': 'Health entry added successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ════════════════════════════════════════════════════════════════════════════
# CONTACT ROUTE
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/contact', methods=['POST'])
def contact_submit():
    """Save a contact form message to the database."""
    data = request.get_json()
    name    = data.get('name', '').strip()
    email   = data.get('email', '').strip()
    message = data.get('message', '').strip()

    if not name or not email or not message:
        return jsonify({'error': 'All fields are required'}), 400

    try:
        cur = mysql.connection.cursor()
        cur.execute(
            'INSERT INTO contact_messages (name, email, message) VALUES (%s, %s, %s)',
            (name, email, message)
        )
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Message received! We will contact you shortly.'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ════════════════════════════════════════════════════════════════════════════
# Run Application
# ════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    app.run(debug=True, port=5000)
