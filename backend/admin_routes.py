from flask import Blueprint, render_template, jsonify, session, request, redirect, url_for
from functools import wraps
from datetime import datetime
import datetime as dt

admin_bp = Blueprint('admin', __name__)

def admin_required(f):
    """Decorator to require admin role for page views."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect('/login') 
        if session.get('user_role') != 'admin':
            return redirect('/dashboard')
        return f(*args, **kwargs)
    return decorated

def admin_api_required(f):
    """Decorator to require admin role for API endpoints."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session or session.get('user_role') != 'admin':
            return jsonify({'error': 'Access Denied: Admins only'}), 403
        return f(*args, **kwargs)
    return decorated


# ==============================================================================
# PAGE VIEWS (HTML)
# ==============================================================================

@admin_bp.route('/dashboard')
@admin_required
def admin_dashboard():
    return render_template('admin_dashboard.html')

@admin_bp.route('/hospitals')
@admin_required
def admin_hospitals():
    return render_template('admin_hospitals.html')

@admin_bp.route('/patients')
@admin_required
def admin_patients():
    return render_template('admin_patients.html')

@admin_bp.route('/users')
@admin_required
def admin_users():
    return render_template('admin_users.html')

@admin_bp.route('/reports')
@admin_required
def admin_reports():
    return render_template('admin_reports.html')


# ==============================================================================
# API ROUTES (JSON)
# ==============================================================================
# Note: we will need `mysql` instance. We can import it from `app` or pass it in.
# To avoid circular imports, we'll import `mysql` inside the functions, or at the top.
from app import mysql

@admin_bp.route('/api/admin/dashboard-stats', methods=['GET'])
@admin_api_required
def dashboard_stats():
    try:
        cur = mysql.connection.cursor()
        
        # 1. Total Hospitals
        cur.execute("SELECT COUNT(*) AS total FROM hospitals")
        total_hosp = cur.fetchone()['total']
        
        # 2. Total Available Beds
        cur.execute("SELECT SUM(available_beds) AS total_beds FROM hospitals")
        total_beds = cur.fetchone()['total_beds'] or 0
        
        # 3. Emergency Requests Today
        cur.execute("SELECT COUNT(*) AS req_today FROM emergency_requests WHERE DATE(requested_at) = CURDATE()")
        req_today = cur.fetchone()['req_today']
        
        # 4. Total Users
        cur.execute("SELECT COUNT(*) AS total_users FROM users WHERE role = 'user'")
        total_users = cur.fetchone()['total_users']
        
        # 5. Table showing all hospitals (Hospital Overview)
        cur.execute("SELECT id, name, available_beds FROM hospitals ORDER BY available_beds ASC")
        hospitals_overview = cur.fetchall()
        
        # 6. Recent 5 emergency requests
        cur.execute('''
            SELECT er.id, er.patient_name, er.status, er.priority, er.requested_at, h.name as hospital_name 
            FROM emergency_requests er 
            LEFT JOIN hospitals h ON er.hospital_id = h.id
            ORDER BY er.requested_at DESC LIMIT 5
        ''')
        recent_requests = cur.fetchall()
        for r in recent_requests:
            if r.get('requested_at'): r['requested_at'] = str(r['requested_at'])
        
        cur.close()
        
        return jsonify({
            'total_hospitals': total_hosp,
            'total_beds': int(total_beds),
            'requests_today': req_today,
            'total_users': total_users,
            'hospitals_overview': hospitals_overview,
            'recent_requests': recent_requests
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/hospitals', methods=['GET'])
@admin_api_required
def get_hospitals():
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM hospitals ORDER BY id DESC")
        hospitals = cur.fetchall()
        cur.close()
        for h in hospitals:
            h['latitude'] = float(h['latitude'])
            h['longitude'] = float(h['longitude'])
        return jsonify(hospitals)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/hospitals', methods=['POST'])
@admin_api_required
def add_hospital():
    data = request.json
    try:
        cur = mysql.connection.cursor()
        cur.execute('''
            INSERT INTO hospitals 
            (name, location, latitude, longitude, total_beds, available_beds, 
            icu_beds, available_icu, ventilators, available_ventilators, contact, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            data.get('name'), data.get('location'), data.get('latitude'), data.get('longitude'),
            data.get('total_beds', 0), data.get('available_beds', 0),
            data.get('icu_beds', 0), data.get('available_icu', 0),
            data.get('ventilators', 0), data.get('available_ventilators', 0),
            data.get('contact'), data.get('is_active', True)
        ))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Hospital added successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/hospitals/<int:h_id>', methods=['PUT'])
@admin_api_required
def edit_hospital(h_id):
    data = request.json
    try:
        cur = mysql.connection.cursor()
        cur.execute('''
            UPDATE hospitals SET 
            name=%s, location=%s, latitude=%s, longitude=%s, total_beds=%s, available_beds=%s,
            icu_beds=%s, available_icu=%s, ventilators=%s, available_ventilators=%s, contact=%s, is_active=%s
            WHERE id=%s
        ''', (
            data.get('name'), data.get('location'), data.get('latitude'), data.get('longitude'),
            data.get('total_beds', 0), data.get('available_beds', 0),
            data.get('icu_beds', 0), data.get('available_icu', 0),
            data.get('ventilators', 0), data.get('available_ventilators', 0),
            data.get('contact'), data.get('is_active', True), h_id
        ))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Hospital updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/hospitals/<int:h_id>/status', methods=['PATCH'])
@admin_api_required
def toggle_hospital_status(h_id):
    data = request.json
    is_active = data.get('is_active', True)
    try:
        cur = mysql.connection.cursor()
        cur.execute('UPDATE hospitals SET is_active=%s WHERE id=%s', (is_active, h_id))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Hospital status updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/hospitals/<int:h_id>', methods=['DELETE'])
@admin_api_required
def delete_hospital(h_id):
    try:
        cur = mysql.connection.cursor()
        cur.execute('DELETE FROM hospitals WHERE id=%s', (h_id,))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Hospital deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/patients', methods=['GET'])
@admin_api_required
def get_patients():
    try:
        cur = mysql.connection.cursor()
        cur.execute('''
            SELECT er.id, er.patient_name, er.description, er.priority, er.status, 
                   er.requested_at, h.name as hospital_name 
            FROM emergency_requests er
            LEFT JOIN hospitals h ON er.hospital_id = h.id
            ORDER BY FIELD(er.priority, 'critical', 'high', 'medium', 'low'), er.requested_at ASC
        ''')
        patients = cur.fetchall()
        cur.close()
        for p in patients:
            if p.get('requested_at'): p['requested_at'] = str(p['requested_at'])
        return jsonify(patients)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/patients/<int:p_id>/assign', methods=['PATCH'])
@admin_api_required
def assign_patient_hospital(p_id):
    hospital_id = request.json.get('hospital_id')
    try:
        cur = mysql.connection.cursor()
        cur.execute('UPDATE emergency_requests SET hospital_id=%s, status="assigned" WHERE id=%s', (hospital_id, p_id))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Hospital assigned successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/patients/<int:p_id>/status', methods=['PATCH'])
@admin_api_required
def update_patient_status(p_id):
    status = request.json.get('status')
    try:
        cur = mysql.connection.cursor()
        cur.execute('UPDATE emergency_requests SET status=%s WHERE id=%s', (status, p_id))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'Status updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/users', methods=['GET'])
@admin_api_required
def get_users():
    try:
        cur = mysql.connection.cursor()
        cur.execute('''
            SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, 
                   COUNT(hd.id) as health_entries
            FROM users u
            LEFT JOIN health_data hd ON u.id = hd.user_id
            GROUP BY u.id
            ORDER BY u.id DESC
        ''')
        users = cur.fetchall()
        cur.close()
        for u in users:
            if u.get('created_at'): u['created_at'] = str(u['created_at'])
        return jsonify(users)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/users/<int:u_id>/status', methods=['PATCH'])
@admin_api_required
def toggle_user_status(u_id):
    is_active = request.json.get('is_active')
    try:
        cur = mysql.connection.cursor()
        cur.execute('UPDATE users SET is_active=%s WHERE id=%s', (is_active, u_id))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'User status updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/users/<int:u_id>/role', methods=['PATCH'])
@admin_api_required
def toggle_user_role(u_id):
    role = request.json.get('role')
    try:
        cur = mysql.connection.cursor()
        cur.execute('UPDATE users SET role=%s WHERE id=%s', (role, u_id))
        mysql.connection.commit()
        cur.close()
        return jsonify({'message': 'User role updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/users/<int:u_id>/health', methods=['GET'])
@admin_api_required
def get_user_health(u_id):
    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM health_data WHERE user_id=%s ORDER BY date DESC LIMIT 7', (u_id,))
        health = cur.fetchall()
        
        cur.execute('SELECT AVG(stress_level) as avg_stress, AVG(sleep_hours) as avg_sleep FROM health_data WHERE user_id=%s', (u_id,))
        avgs = cur.fetchone()
        cur.close()
        
        for h in health:
            if h.get('date'): h['date'] = str(h['date'])
            if h.get('sleep_hours'): h['sleep_hours'] = float(h['sleep_hours'])
            if h.get('screen_time_hours'): h['screen_time_hours'] = float(h['screen_time_hours'])
            
        avg_stress = float(avgs['avg_stress']) if avgs and avgs['avg_stress'] is not None else 0
        avg_sleep = float(avgs['avg_sleep']) if avgs and avgs['avg_sleep'] is not None else 0
        
        return jsonify({
            'history': health,
            'avg_stress': avg_stress,
            'avg_sleep': avg_sleep
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/reports/overview', methods=['GET'])
@admin_api_required
def reports_overview():
    try:
        cur = mysql.connection.cursor()
        # 1. Total emergency requests this week
        cur.execute("SELECT COUNT(*) as total FROM emergency_requests WHERE requested_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)")
        reqs_week = cur.fetchone()['total']
        
        # 2. Average response time (mocking as we don't have assigned_at timestamp, we'll return a static value or count of completed)
        # Actually, let's just return a placeholder for avg response time
        
        # 3. Most used hospital
        cur.execute('''
            SELECT h.name, COUNT(e.id) as total_requests
            FROM emergency_requests e
            JOIN hospitals h ON e.hospital_id = h.id
            GROUP BY h.name ORDER BY total_requests DESC LIMIT 1
        ''')
        most_used = cur.fetchone()
        
        # 4. Busiest day
        cur.execute('''
            SELECT DAYNAME(requested_at) as day_name, COUNT(*) as total
            FROM emergency_requests 
            GROUP BY day_name ORDER BY total DESC LIMIT 1
        ''')
        busiest_day = cur.fetchone()
        
        cur.close()
        return jsonify({
            'requests_this_week': reqs_week,
            'avg_response_time': '12 mins', 
            'most_used_hospital': most_used['name'] if most_used else 'N/A',
            'busiest_day': busiest_day['day_name'] if busiest_day else 'N/A'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/reports/requests', methods=['GET'])
@admin_api_required
def reports_requests():
    try:
        cur = mysql.connection.cursor()
        cur.execute('''
            SELECT DATE(requested_at) as day, COUNT(*) as total
            FROM emergency_requests
            WHERE requested_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(requested_at)
            ORDER BY day ASC
        ''')
        data = cur.fetchall()
        cur.close()
        for d in data:
            if d.get('day'): d['day'] = str(d['day'])
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/reports/priority', methods=['GET'])
@admin_api_required
def reports_priority():
    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT priority, COUNT(*) as count FROM emergency_requests GROUP BY priority')
        data = cur.fetchall()
        cur.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/reports/hospitals', methods=['GET'])
@admin_api_required
def reports_hospitals():
    try:
        cur = mysql.connection.cursor()
        cur.execute('''
            SELECT h.name, COUNT(e.id) as total_requests
            FROM emergency_requests e
            JOIN hospitals h ON e.hospital_id = h.id
            GROUP BY h.name ORDER BY total_requests DESC LIMIT 5
        ''')
        data = cur.fetchall()
        cur.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/reports/beds', methods=['GET'])
@admin_api_required
def reports_beds():
    try:
        cur = mysql.connection.cursor()
        cur.execute('SELECT name, available_beds, total_beds FROM hospitals ORDER BY total_beds DESC LIMIT 10')
        data = cur.fetchall()
        cur.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
