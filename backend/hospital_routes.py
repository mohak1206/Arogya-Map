"""
Arogya Map — Hospital Portal Routes & APIs
Blueprint for hospital staff managing their facility, capacity, and emergency requests.
"""

import re
import time
from functools import wraps
from flask import Blueprint, render_template, jsonify, session, request, redirect, url_for
from werkzeug.security import generate_password_hash
from database import mysql
from broadcaster import broadcaster

hospital_bp = Blueprint('hospital', __name__, url_prefix='/hospital')
hospital_api_bp = Blueprint('hospital_api', __name__, url_prefix='/api/hospital')

# In-memory IP rate limiter for registration applications: IP -> list of timestamps
_apply_rate_limit = {}

# ─────────────────────────────────────────────────────────────────────────────
# DECORATORS
# ─────────────────────────────────────────────────────────────────────────────

def hospital_required(f):
    """Decorator to require authenticated hospital staff for page views."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            safe_next = request.path if request.path.startswith('/') and not request.path.startswith('//') else '/hospital/dashboard'
            return redirect(f'/login?next={safe_next}')

        if session.get('user_role') != 'hospital':
            if session.get('user_role') == 'admin':
                return redirect('/admin/dashboard')
            return redirect('/dashboard')

        h_id = session.get('hospital_id')
        if not h_id:
            session.clear()
            return redirect('/login?error=no_hospital_assigned')

        # Check hospital is active
        try:
            cur = mysql.connection.cursor()
            cur.execute("SELECT id, name, is_active FROM hospitals WHERE id = %s", (h_id,))
            hosp = cur.fetchone()
            cur.close()
            if not hosp or not hosp.get('is_active'):
                session.clear()
                return redirect('/login?error=hospital_inactive')
        except Exception:
            return redirect('/login?error=db_error')

        return f(*args, **kwargs)
    return decorated


def hospital_api_required(f):
    """
    Decorator to require authenticated hospital staff for API views.
    Ensures hospital is active and attaches hospital_id to request context.
    SECURITY: Always derives hospital from session, NEVER from client params.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401

        if session.get('user_role') != 'hospital':
            return jsonify({'error': 'Access denied: Hospital staff role required'}), 403

        h_id = session.get('hospital_id')
        if not h_id:
            return jsonify({'error': 'No hospital linked to this staff account'}), 403

        try:
            cur = mysql.connection.cursor()
            cur.execute("SELECT id, name, is_active FROM hospitals WHERE id = %s", (h_id,))
            hosp = cur.fetchone()
            cur.close()
            if not hosp:
                return jsonify({'error': 'Hospital record not found'}), 404
            if not hosp.get('is_active'):
                return jsonify({'error': 'Hospital account is currently inactive'}), 403
        except Exception as e:
            return jsonify({'error': 'Database error verifying account'}), 500

        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────────────────────────────────────
# PAGE ROUTES (Jinja2 HTML Views)
# ─────────────────────────────────────────────────────────────────────────────

@hospital_bp.route('/register')
def hospital_register_page():
    return render_template('hospital_register.html')

@hospital_bp.route('/dashboard')
@hospital_required
def hospital_dashboard():
    return render_template('hospital_dashboard.html')

@hospital_bp.route('/profile')
@hospital_required
def hospital_profile():
    return render_template('hospital_profile.html')

@hospital_bp.route('/history')
@hospital_required
def hospital_history():
    return render_template('hospital_history.html')


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC REGISTRATION API
# ─────────────────────────────────────────────────────────────────────────────

@hospital_api_bp.route('/apply', methods=['POST'])
def apply_hospital():
    """
    Public hospital application endpoint.
    Includes rate limiting, honeypot protection, trimmed validation,
    and Werkzeug password hashing.
    """
    # 1. IP Rate Limiting: max 5 applications per 10 minutes
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or '127.0.0.1').split(',')[0].strip()
    now = time.time()
    history = _apply_rate_limit.get(client_ip, [])
    # keep timestamps within 600 seconds
    history = [t for t in history if now - t < 600]
    if len(history) >= 5:
        return jsonify({'error': 'Too many applications submitted from this IP. Please wait 10 minutes.'}), 429
    history.append(now)
    _apply_rate_limit[client_ip] = history

    data = request.get_json() or {}

    # 2. Honeypot check (hidden field that bots populate)
    if data.get('website_url_hp'):
        return jsonify({'error': 'Invalid form submission'}), 400

    hospital_name = str(data.get('hospital_name', '')).strip()
    hosp_type = str(data.get('type', 'hospital')).strip().lower()
    address = str(data.get('address', '')).strip()
    phone = str(data.get('phone', '')).strip()
    contact_person = str(data.get('contact_person', '')).strip()
    email = str(data.get('email', '')).strip().lower()
    reg_number = str(data.get('registration_number', '')).strip()
    password = str(data.get('password', ''))
    confirm_password = str(data.get('confirm_password', ''))

    # 3. Validation
    if not hospital_name or len(hospital_name) < 3 or len(hospital_name) > 150:
        return jsonify({'error': 'Hospital name must be between 3 and 150 characters'}), 400

    if hosp_type not in ('hospital', 'clinic'):
        hosp_type = 'hospital'

    if not address or len(address) < 5:
        return jsonify({'error': 'Full address is required (minimum 5 characters)'}), 400

    try:
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            return jsonify({'error': 'Latitude or longitude coordinates are out of valid range'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Valid latitude and longitude are required. Please pick a location on the map.'}), 400

    phone_clean = re.sub(r'[\s\-+()]', '', phone)
    if not phone or len(phone_clean) < 7 or len(phone) > 20:
        return jsonify({'error': 'Please provide a valid contact phone number'}), 400

    if not contact_person or len(contact_person) < 2 or len(contact_person) > 100:
        return jsonify({'error': 'Contact person name is required'}), 400

    email_regex = r'^[\w\.\+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-\.]+$'
    if not email or not re.match(email_regex, email) or len(email) > 100:
        return jsonify({'error': 'Please provide a valid official email address'}), 400

    if not reg_number or len(reg_number) < 2 or len(reg_number) > 100:
        return jsonify({'error': 'Hospital licence or registration number is required'}), 400

    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters long'}), 400

    if password != confirm_password:
        return jsonify({'error': 'Password and confirmation password do not match'}), 400

    # 4. Check uniqueness against users and existing applications
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            return jsonify({'error': 'An account with this email address already exists in the system'}), 409

        cur.execute("SELECT id, status FROM hospital_applications WHERE email = %s", (email,))
        existing_app = cur.fetchone()
        if existing_app:
            cur.close()
            if existing_app['status'] == 'pending':
                return jsonify({'error': 'An application with this email address is already pending review'}), 409
            elif existing_app['status'] == 'approved':
                return jsonify({'error': 'An approved hospital already exists with this email. Please log in directly.'}), 409
            else:
                return jsonify({'error': 'A previous application with this email was reviewed. Please contact administration.'}), 409

        password_hash = generate_password_hash(password)

        cur.execute("""
            INSERT INTO hospital_applications
            (hospital_name, type, address, latitude, longitude, phone, contact_person, email, password_hash, registration_number, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
        """, (
            hospital_name, hosp_type, address, latitude, longitude,
            phone, contact_person, email, password_hash, reg_number
        ))
        app_id = cur.lastrowid
        mysql.connection.commit()
        cur.close()

        return jsonify({
            'message': 'Application received successfully. Our administrative team will review your credentials and verify your facility before granting access.',
            'application_id': app_id
        }), 201

    except Exception as e:
        return jsonify({'error': 'An internal error occurred while submitting your application. Please try again.'}), 500


# ─────────────────────────────────────────────────────────────────────────────
# HOSPITAL PORTAL APIs (Authenticated, scoped to session['hospital_id'])
# ─────────────────────────────────────────────────────────────────────────────

@hospital_api_bp.route('/me', methods=['GET'])
@hospital_api_required
def get_my_hospital():
    """Returns details and current bed capacity for the logged-in hospital."""
    h_id = session['hospital_id']
    try:
        cur = mysql.connection.cursor()
        cur.execute("""
            SELECT id, name, type, location, address, latitude, longitude,
                   total_beds, available_beds, icu_beds, available_icu,
                   ventilators, available_ventilators, contact, open_24h,
                   hours_note, is_active, beds_updated_at, speciality
            FROM hospitals WHERE id = %s
        """, (h_id,))
        hosp = cur.fetchone()
        cur.close()

        if not hosp:
            return jsonify({'error': 'Hospital not found'}), 404

        hosp['latitude'] = float(hosp['latitude'])
        hosp['longitude'] = float(hosp['longitude'])
        if hosp.get('beds_updated_at'):
            hosp['beds_updated_at'] = str(hosp['beds_updated_at'])

        return jsonify({
            'hospital': hosp,
            'user': {
                'id': session.get('user_id'),
                'name': session.get('user_name'),
                'email': session.get('user_email')
            }
        }), 200
    except Exception as e:
        return jsonify({'error': 'Failed to load hospital details'}), 500


@hospital_api_bp.route('/capacity', methods=['PUT'])
@hospital_api_required
def update_capacity():
    """
    Update bed, ICU, and ventilator capacity for this hospital.
    Strictly validates integers and 0 <= available <= total.
    Runs inside a transaction, logs each changed field in bed_updates,
    updates beds_updated_at = NOW(), and broadcasts live to public maps.
    """
    h_id = session['hospital_id']
    u_id = session.get('user_id')
    data = request.get_json() or {}

    try:
        avail_beds = int(data.get('available_beds'))
        tot_beds = int(data.get('total_beds'))
        avail_icu = int(data.get('available_icu'))
        tot_icu = int(data.get('icu_beds'))
        avail_vent = int(data.get('available_ventilators'))
        tot_vent = int(data.get('ventilators'))
    except (TypeError, ValueError):
        return jsonify({'error': 'All capacity counts must be valid whole numbers'}), 400

    if not (0 <= avail_beds <= tot_beds):
        return jsonify({'error': f'Available beds ({avail_beds}) must be between 0 and total beds ({tot_beds})'}), 400

    if not (0 <= avail_icu <= tot_icu):
        return jsonify({'error': f'Available ICU beds ({avail_icu}) must be between 0 and total ICU beds ({tot_icu})'}), 400

    if not (0 <= avail_vent <= tot_vent):
        return jsonify({'error': f'Available ventilators ({avail_vent}) must be between 0 and total ventilators ({tot_vent})'}), 400

    try:
        cur = mysql.connection.cursor()
        mysql.connection.begin()
        try:
            # Lock row for atomic update and field comparison
            cur.execute("""
                SELECT total_beds, available_beds, icu_beds, available_icu, ventilators, available_ventilators
                FROM hospitals WHERE id = %s FOR UPDATE
            """, (h_id,))
            current = cur.fetchone()
            if not current:
                mysql.connection.rollback()
                cur.close()
                return jsonify({'error': 'Hospital not found'}), 404

            fields_map = [
                ('total_beds', current['total_beds'], tot_beds),
                ('available_beds', current['available_beds'], avail_beds),
                ('icu_beds', current['icu_beds'], tot_icu),
                ('available_icu', current['available_icu'], avail_icu),
                ('ventilators', current['ventilators'], tot_vent),
                ('available_ventilators', current['available_ventilators'], avail_vent)
            ]

            # Insert audit log for each changed field
            for field_name, old_val, new_val in fields_map:
                if old_val != new_val:
                    cur.execute("""
                        INSERT INTO bed_updates (hospital_id, user_id, field, old_value, new_value)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (h_id, u_id, field_name, old_val, new_val))

            cur.execute("""
                UPDATE hospitals SET
                    total_beds = %s,
                    available_beds = %s,
                    icu_beds = %s,
                    available_icu = %s,
                    ventilators = %s,
                    available_ventilators = %s,
                    beds_updated_at = NOW()
                WHERE id = %s
            """, (tot_beds, avail_beds, tot_icu, avail_icu, tot_vent, avail_vent, h_id))

            mysql.connection.commit()
        except Exception as tx_err:
            mysql.connection.rollback()
            cur.close()
            return jsonify({'error': f'Failed to update capacity: {str(tx_err)}'}), 500

        cur.close()

        # Broadcast real-time bed telemetry
        try:
            broadcaster.broadcast({
                'event': 'bed_update',
                'hospital_id': h_id,
                'total_beds': tot_beds,
                'available_beds': avail_beds,
                'icu_beds': tot_icu,
                'available_icu': avail_icu,
                'ventilators': tot_vent,
                'available_ventilators': avail_vent
            })
        except Exception:
            pass

        return jsonify({'message': 'Capacity updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500


@hospital_api_bp.route('/profile', methods=['PUT'])
@hospital_api_required
def update_profile():
    """
    Update profile details for the hospital.
    Changes to name and location are saved and logged.
    """
    h_id = session['hospital_id']
    data = request.get_json() or {}

    name = str(data.get('name', '')).strip()
    hosp_type = str(data.get('type', 'hospital')).strip().lower()
    address = str(data.get('address', '')).strip()
    phone = str(data.get('phone', '')).strip()
    open_24h = 1 if data.get('open_24h') in (True, 1, '1', 'true') else 0
    hours_note = str(data.get('hours_note', '')).strip()

    if not name or len(name) < 3 or len(name) > 150:
        return jsonify({'error': 'Hospital name must be between 3 and 150 characters'}), 400

    if hosp_type not in ('hospital', 'clinic'):
        hosp_type = 'hospital'

    if not address:
        return jsonify({'error': 'Address is required'}), 400

    try:
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            return jsonify({'error': 'Coordinates out of bounds'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Valid latitude and longitude are required'}), 400

    try:
        cur = mysql.connection.cursor()
        cur.execute("""
            UPDATE hospitals SET
                name = %s,
                type = %s,
                location = %s,
                address = %s,
                contact = %s,
                latitude = %s,
                longitude = %s,
                open_24h = %s,
                hours_note = %s
            WHERE id = %s
        """, (name, hosp_type, address, address, phone, latitude, longitude, open_24h, hours_note, h_id))
        mysql.connection.commit()
        cur.close()

        return jsonify({'message': 'Hospital profile updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to update hospital profile'}), 500


@hospital_api_bp.route('/requests', methods=['GET'])
@hospital_api_required
def get_hospital_requests():
    """
    Returns emergency requests assigned to THIS hospital.
    Ordered by status ('assigned' first) and priority urgency.
    """
    h_id = session['hospital_id']
    try:
        cur = mysql.connection.cursor()
        cur.execute("""
            SELECT er.id, er.patient_name, er.description, er.priority, er.status, er.requested_at,
                   u.name as requester_name, u.email as requester_email
            FROM emergency_requests er
            LEFT JOIN users u ON er.user_id = u.id
            WHERE er.hospital_id = %s
            ORDER BY
                CASE WHEN er.status = 'assigned' THEN 0 ELSE 1 END,
                FIELD(er.priority, 'critical', 'high', 'medium', 'low'),
                er.requested_at DESC
        """, (h_id,))
        requests_list = cur.fetchall()
        cur.close()

        for r in requests_list:
            if r.get('requested_at'):
                r['requested_at'] = str(r['requested_at'])

        return jsonify({'requests': requests_list}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to load emergency requests'}), 500


@hospital_api_bp.route('/requests/<int:req_id>/complete', methods=['PATCH'])
@hospital_api_required
def complete_request(req_id):
    """
    Mark an assigned emergency request as completed.
    Restores consumed bed counts (ICU if critical) exactly once in a transaction.
    SECURITY: Scoped strictly to session['hospital_id'].
    """
    h_id = session['hospital_id']

    try:
        cur = mysql.connection.cursor()
        mysql.connection.begin()
        try:
            # Lock the request row and verify it belongs to this hospital
            cur.execute("""
                SELECT id, hospital_id, priority, status
                FROM emergency_requests
                WHERE id = %s AND hospital_id = %s
                FOR UPDATE
            """, (req_id, h_id))
            req_row = cur.fetchone()

            if not req_row:
                mysql.connection.rollback()
                cur.close()
                return jsonify({'error': 'Emergency request not found or not assigned to your hospital'}), 404

            prev_status = req_row.get('status')
            if prev_status != 'assigned':
                mysql.connection.rollback()
                cur.close()
                return jsonify({'error': f'Request is already {prev_status}. Beds were already restored.'}), 400

            priority = req_row.get('priority')

            # Restore bed counts in hospital row without exceeding totals
            if priority == 'critical':
                cur.execute("""
                    UPDATE hospitals SET
                        available_beds = LEAST(total_beds, available_beds + 1),
                        available_icu = LEAST(icu_beds, available_icu + 1),
                        beds_updated_at = NOW()
                    WHERE id = %s
                """, (h_id,))
            else:
                cur.execute("""
                    UPDATE hospitals SET
                        available_beds = LEAST(total_beds, available_beds + 1),
                        beds_updated_at = NOW()
                    WHERE id = %s
                """, (h_id,))

            cur.execute("UPDATE emergency_requests SET status = 'completed' WHERE id = %s", (req_id,))
            mysql.connection.commit()

            # Fetch restored counts for broadcasting
            cur.execute("SELECT total_beds, available_beds, icu_beds, available_icu, ventilators, available_ventilators FROM hospitals WHERE id = %s", (h_id,))
            restored = cur.fetchone()
            if restored:
                try:
                    broadcaster.broadcast({
                        'event': 'bed_update',
                        'hospital_id': h_id,
                        'total_beds': restored['total_beds'],
                        'available_beds': restored['available_beds'],
                        'icu_beds': restored['icu_beds'],
                        'available_icu': restored['available_icu'],
                        'ventilators': restored['ventilators'],
                        'available_ventilators': restored['available_ventilators']
                    })
                except Exception:
                    pass

        except Exception as tx_err:
            mysql.connection.rollback()
            cur.close()
            return jsonify({'error': f'Transaction failed: {str(tx_err)}'}), 500

        cur.close()
        return jsonify({'message': 'Emergency request marked as completed and capacity restored'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to complete emergency request'}), 500


@hospital_api_bp.route('/history', methods=['GET'])
@hospital_api_required
def get_bed_history():
    """
    Returns paginated audit log of bed updates for this hospital.
    """
    h_id = session['hospital_id']
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(50, max(5, int(request.args.get('limit', 20))))
        offset = (page - 1) * limit

        cur = mysql.connection.cursor()
        cur.execute("SELECT COUNT(*) as total FROM bed_updates WHERE hospital_id = %s", (h_id,))
        total = cur.fetchone()['total']

        cur.execute("""
            SELECT bu.id, bu.field, bu.old_value, bu.new_value, bu.created_at,
                   u.name as user_name
            FROM bed_updates bu
            LEFT JOIN users u ON bu.user_id = u.id
            WHERE bu.hospital_id = %s
            ORDER BY bu.created_at DESC
            LIMIT %s OFFSET %s
        """, (h_id, limit, offset))
        updates = cur.fetchall()
        cur.close()

        for u in updates:
            if u.get('created_at'):
                u['created_at'] = str(u['created_at'])

        return jsonify({
            'history': updates,
            'total': total,
            'page': page,
            'limit': limit,
            'total_pages': (total + limit - 1) // limit if limit else 1
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to load update history'}), 500
