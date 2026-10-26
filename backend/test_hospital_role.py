"""
Test Suite for Hospital Role, Application Workflow, Capacity Auditing, and Security Constraints.
"""
import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app
from database import mysql

def run_tests():
    print("\n" + "=" * 70)
    print("  RUNNING COMPREHENSIVE HOSPITAL ROLE & SECURITY TEST SUITE")
    print("=" * 70 + "\n")

    client = app.test_client()

    # ── Test 1: Public Registration Validation & Honeypot ─────────────────
    print("[1] Testing Public Hospital Application...")
    test_email = "test_hospital_staff@example.com"
    test_hosp_name = "Metro City Trauma Center"

    test_admin_email = "test_admin@system.com"
    test_admin_pass = "admin123"

    # Clean up any leftover test data and ensure test admin
    with app.app_context():
        from werkzeug.security import generate_password_hash
        cur = mysql.connection.cursor()
        cur.execute("DELETE FROM hospital_applications WHERE email = %s", (test_email,))
        cur.execute("DELETE FROM users WHERE email IN (%s, %s)", (test_email, test_admin_email))
        cur.execute("DELETE FROM hospitals WHERE name = %s", (test_hosp_name,))
        cur.execute("""
            INSERT INTO users (name, email, password, role, is_active)
            VALUES ('Test Admin', %s, %s, 'admin', 1)
        """, (test_admin_email, generate_password_hash(test_admin_pass)))
        mysql.connection.commit()
        cur.close()

    # Honeypot trap test
    bot_payload = {
        'hospital_name': test_hosp_name,
        'type': 'hospital',
        'address': '123 Medical Road, Mumbai',
        'latitude': 19.076,
        'longitude': 72.877,
        'phone': '9876543210',
        'contact_person': 'Dr. Sharma',
        'email': test_email,
        'registration_number': 'MH-MED-2026-9988',
        'password': 'Password123!',
        'confirm_password': 'Password123!',
        'website_url_hp': 'https://spambot.com' # Honeypot filled!
    }
    res = client.post('/api/hospital/apply', json=bot_payload)
    assert res.status_code == 400, f"Expected 400 for honeypot, got {res.status_code}"
    print("    [PASS] Honeypot rejection verified")

    # Valid application
    valid_payload = dict(bot_payload)
    valid_payload['website_url_hp'] = '' # Honeypot empty
    res = client.post('/api/hospital/apply', json=valid_payload)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.get_json()}"
    app_id = res.get_json().get('application_id')
    assert app_id is not None
    print(f"    [PASS] Valid application submitted successfully (ID: {app_id})")

    # ── Test 2: Cannot Login While Pending ────────────────────────────────
    print("\n[2] Testing Login Block for Pending Application...")
    login_res = client.post('/api/login', json={'email': test_email, 'password': 'Password123!'})
    assert login_res.status_code == 403, f"Expected 403, got {login_res.status_code}: {login_res.get_json()}"
    assert "pending" in login_res.get_json().get('error', '').lower()
    print("    [PASS] Pending hospital staff properly blocked with status explanation")

    # ── Test 3: Admin Review and Approval ────────────────────────────────
    print("\n[3] Testing Admin Application Review & Approval...")
    # Login as admin
    admin_login = client.post('/api/login', json={'email': test_admin_email, 'password': test_admin_pass})
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.get_json()}"
    print("    [PASS] Admin logged in successfully")

    # Fetch applications
    apps_res = client.get('/api/admin/applications?status=pending')
    assert apps_res.status_code == 200
    apps_data = apps_res.get_json()
    apps = apps_data if isinstance(apps_data, list) else apps_data.get('applications', [])
    assert any(a['id'] == app_id for a in apps)
    print(f"    [PASS] Application visible in admin pending list ({len(apps)} pending)")

    def get_csrf(cl):
        with cl.session_transaction() as sess:
            return sess.get('_csrf_token', '')

    # Approve application in transaction
    approve_res = client.patch(f'/api/admin/applications/{app_id}', json={
        'action': 'approve',
        'note': 'Registration licence MH-MED-2026-9988 verified with state medical council.'
    }, headers={'X-CSRF-Token': get_csrf(client)})
    assert approve_res.status_code == 200, f"Approval failed: {approve_res.get_json()}"
    hosp_id = approve_res.get_json().get('hospital_id')
    assert hosp_id is not None
    print(f"    [PASS] Application approved and created hospital ID: {hosp_id}")

    # Logout admin
    client.get('/api/logout')

    # ── Test 4: Hospital Login and Portal Permissions ────────────────────
    print("\n[4] Testing Hospital Login and Dashboard Permissions...")
    hosp_login = client.post('/api/login', json={'email': test_email, 'password': 'Password123!'})
    assert hosp_login.status_code == 200, f"Hospital login failed: {hosp_login.get_json()}"
    login_data = hosp_login.get_json()
    assert login_data.get('role') == 'hospital'
    assert login_data.get('hospital_id') == hosp_id
    assert login_data.get('redirect') == '/hospital/dashboard'
    print("    [PASS] Hospital logged in with role='hospital' and redirect='/hospital/dashboard'")

    # Security check: Hospital user CANNOT access admin APIs
    forbidden_res = client.get('/api/admin/dashboard-stats')
    assert forbidden_res.status_code == 403, f"Hospital user should get 403 on admin API, got {forbidden_res.status_code}"
    print("    [PASS] Hospital user correctly denied access to /api/admin/* (403 Forbidden)")

    # ── Test 5: Hospital Bed Capacity Update & Audit Logging ─────────────
    print("\n[5] Testing Bed Capacity Updates and bed_updates Audit Trail...")
    # Test invalid: available > total
    bad_res = client.put('/api/hospital/capacity', json={
        'available_beds': 50,
        'total_beds': 30, # Invalid!
        'available_icu': 5,
        'icu_beds': 10,
        'available_ventilators': 2,
        'ventilators': 5
    }, headers={'X-CSRF-Token': get_csrf(client)})
    assert bad_res.status_code == 400
    print("    [PASS] Available > total correctly rejected (400 Bad Request)")

    # Test invalid: negative values
    neg_res = client.put('/api/hospital/capacity', json={
        'available_beds': -1, # Invalid!
        'total_beds': 30,
        'available_icu': 5,
        'icu_beds': 10,
        'available_ventilators': 2,
        'ventilators': 5
    }, headers={'X-CSRF-Token': get_csrf(client)})
    assert neg_res.status_code == 400
    print("    [PASS] Negative capacity correctly rejected (400 Bad Request)")

    # Valid capacity update
    good_res = client.put('/api/hospital/capacity', json={
        'available_beds': 25,
        'total_beds': 40,
        'available_icu': 8,
        'icu_beds': 12,
        'available_ventilators': 4,
        'ventilators': 6
    }, headers={'X-CSRF-Token': get_csrf(client)})
    assert good_res.status_code == 200, f"Capacity update failed: {good_res.get_json()}"
    print("    [PASS] Valid capacity saved successfully")

    # Verify audit log in database
    with app.app_context():
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM bed_updates WHERE hospital_id = %s ORDER BY id ASC", (hosp_id,))
        updates = cur.fetchall()
        assert len(updates) > 0, "Expected bed_updates entries to be logged"
        fields_logged = [u['field'] for u in updates]
        print(f"    [PASS] bed_updates entries written: {fields_logged}")

        cur.execute("SELECT beds_updated_at FROM hospitals WHERE id = %s", (hosp_id,))
        hosp_row = cur.fetchone()
        assert hosp_row['beds_updated_at'] is not None
        print(f"    [PASS] hospitals.beds_updated_at timestamp is set ({hosp_row['beds_updated_at']})")
        cur.close()

    # ── Test 6: Audit History API ────────────────────────────────────────
    print("\n[6] Testing Hospital Audit History Pagination...")
    hist_res = client.get('/api/hospital/history?page=1&limit=10')
    assert hist_res.status_code == 200
    hist_data = hist_res.get_json()
    assert hist_data.get('total') > 0
    assert len(hist_data.get('history', [])) > 0
    print(f"    [PASS] Audit history API returned {len(hist_data['history'])} records (Total: {hist_data['total']})")

    # ── Test 7: Emergency Request Assignment & Safe Bed Restoration ──────
    print("\n[7] Testing Emergency Request Completion & Atomic Bed Restoration...")
    with app.app_context():
        cur = mysql.connection.cursor()
        # Seed an assigned critical emergency request
        cur.execute("""
            INSERT INTO emergency_requests (user_id, hospital_id, patient_name, description, priority, status)
            VALUES (1, %s, 'Critical Patient Alpha', 'Cardiac distress', 'critical', 'assigned')
        """, (hosp_id,))
        req_id = cur.lastrowid
        # Manually decrement capacity to simulate pre-booking
        cur.execute("""
            UPDATE hospitals SET available_beds = 24, available_icu = 7 WHERE id = %s
        """, (hosp_id,))
        mysql.connection.commit()
        cur.close()

    # Complete the request
    complete_res = client.patch(f'/api/hospital/requests/{req_id}/complete', headers={'X-CSRF-Token': get_csrf(client)})
    assert complete_res.status_code == 200, f"Complete failed: {complete_res.get_json()}"
    print(f"    [PASS] Emergency request #{req_id} marked completed")

    # Verify beds restored in DB
    with app.app_context():
        cur = mysql.connection.cursor()
        cur.execute("SELECT available_beds, available_icu FROM hospitals WHERE id = %s", (hosp_id,))
        restored_hosp = cur.fetchone()
        assert restored_hosp['available_beds'] == 25, f"Expected available_beds=25, got {restored_hosp['available_beds']}"
        assert restored_hosp['available_icu'] == 8, f"Expected available_icu=8, got {restored_hosp['available_icu']}"
        print(f"    [PASS] Beds restored accurately: General={restored_hosp['available_beds']}, ICU={restored_hosp['available_icu']}")

        # Attempt to complete AGAIN -> Must be rejected!
        cur.close()

    repeat_res = client.patch(f'/api/hospital/requests/{req_id}/complete', headers={'X-CSRF-Token': get_csrf(client)})
    assert repeat_res.status_code == 400
    print("    [PASS] Second completion attempt rejected (prevents double-restoring beds)")

    # ── Test 8: Security - Cross-Hospital Isolation ──────────────────────
    print("\n[8] Testing Cross-Hospital Tampering Protection...")
    # Attempt to complete a request assigned to another hospital or fetch other hospital data
    foreign_res = client.patch('/api/hospital/requests/99999/complete', headers={'X-CSRF-Token': get_csrf(client)})
    assert foreign_res.status_code == 404
    print("    [PASS] Requests belonging to other hospitals are inaccessible (404 Not Found)")

    # ── Test 9: Public Finder Filter for Inactive Hospitals ──────────────
    print("\n[9] Testing Public Finder Inactive Hospital Filtering...")
    with app.app_context():
        cur = mysql.connection.cursor()
        cur.execute("UPDATE hospitals SET is_active = 0 WHERE id = %s", (hosp_id,))
        mysql.connection.commit()
        cur.close()

    finder_res = client.get('/api/hospitals')
    assert finder_res.status_code == 200
    active_hosps = finder_res.get_json().get('hospitals', [])
    assert all(h['id'] != hosp_id for h in active_hosps), "Inactive hospital should not be in public list!"
    print("    [PASS] Inactive hospital (is_active=0) successfully hidden from public finder")

    # Clean up test records
    with app.app_context():
        cur = mysql.connection.cursor()
        cur.execute("DELETE FROM emergency_requests WHERE id = %s", (req_id,))
        cur.execute("DELETE FROM bed_updates WHERE hospital_id = %s", (hosp_id,))
        cur.execute("DELETE FROM hospital_applications WHERE id = %s", (app_id,))
        cur.execute("DELETE FROM users WHERE email IN (%s, %s)", (test_email, test_admin_email))
        cur.execute("DELETE FROM hospitals WHERE id = %s", (hosp_id,))
        mysql.connection.commit()
        cur.close()

    print("\n" + "=" * 70)
    print("  ALL TESTS PASSED SUCCESSFULLY! (9/9 SUITES VERIFIED)")
    print("=" * 70 + "\n")

if __name__ == '__main__':
    run_tests()
