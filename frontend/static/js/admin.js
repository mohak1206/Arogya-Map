/* admin.js - Logic for the Arogya Map Admin Panel */

// ===== CSRF HELPER =====
function getCsrfHeader() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta && meta.content ? { 'X-CSRF-Token': meta.content } : {};
}

// ===== DASHBOARD LOGIC =====
async function fetchAdminDashboardStats() {
    try {
        const response = await fetch('/api/admin/dashboard-stats');
        if (!response.ok) {
            if (response.status === 403) window.location.href = '/dashboard';
            throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        
        const statHosp = document.getElementById('stat-hospitals');
        if (statHosp) statHosp.textContent = data.total_hospitals;
        const statBeds = document.getElementById('stat-beds');
        if (statBeds) statBeds.textContent = data.total_beds;
        const statReqs = document.getElementById('stat-requests');
        if (statReqs) statReqs.textContent = data.requests_today;
        const statUsers = document.getElementById('stat-users');
        if (statUsers) statUsers.textContent = data.total_users;

        const statPending = document.getElementById('stat-pending-apps');
        if (statPending && data.pending_applications !== undefined) {
            statPending.textContent = data.pending_applications;
        }

        const badge = document.getElementById('pending-apps-badge');
        if (badge && data.pending_applications !== undefined) {
            badge.textContent = data.pending_applications;
            badge.style.display = data.pending_applications > 0 ? 'inline-block' : 'none';
        }

        const hospBody = document.getElementById('hospital-capacity-body');
        if (hospBody && data.hospitals_overview) {
            hospBody.innerHTML = '';
            data.hospitals_overview.forEach(h => {
                let statusDot = 'green';
                if (h.available_beds < 10) statusDot = 'red';
                else if (h.available_beds <= 50) statusDot = 'orange';

                hospBody.innerHTML += `
                    <tr>
                        <td><div class="status-dot ${statusDot}"></div></td>
                        <td>${h.name}</td>
                        <td><strong>${h.available_beds}</strong></td>
                    </tr>
                `;
            });
        }

        const reqBody = document.getElementById('recent-requests-body');
        if (reqBody && data.recent_requests) {
            reqBody.innerHTML = '';
            data.recent_requests.forEach(r => {
                reqBody.innerHTML += `
                    <tr>
                        <td>${r.patient_name}</td>
                        <td style="color: var(--teal);">${r.hospital_name || 'Unassigned'}</td>
                        <td><span class="badge ${r.priority}">${r.priority}</span></td>
                        <td><span class="badge ${r.status}">${r.status}</span></td>
                    </tr>
                `;
            });
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ===== HOSPITALS LOGIC =====
let allHospitals = [];

async function fetchAdminHospitals() {
    try {
        const response = await fetch('/api/admin/hospitals');
        if (!response.ok) throw new Error('Failed to fetch hospitals');
        allHospitals = await response.json();
        renderHospitals(allHospitals);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderHospitals(hospitals) {
    const tbody = document.getElementById('hospitals-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    hospitals.forEach(h => {
        const status = h.is_active ? '<span class="badge low">Active</span>' : '<span class="badge critical">Inactive</span>';
        tbody.innerHTML += `
            <tr>
                <td><strong>${h.name}</strong> <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">(${h.type || 'hospital'})</span></td>
                <td>${h.location}</td>
                <td>${h.total_beds} / <span style="color: var(--teal); font-weight: bold;">${h.available_beds}</span></td>
                <td>${h.icu_beds} / <span style="color: var(--teal); font-weight: bold;">${h.available_icu}</span></td>
                <td>${status}</td>
                <td class="admin-actions">
                    <button class="btn btn-outline" onclick="openHospitalModal(${h.id})"><i class="fa fa-pen"></i></button>
                    <button class="btn btn-outline" onclick="openBedUpdateModal(${h.id}, '${h.name.replace(/'/g, "\\'")}', ${h.available_beds}, ${h.available_icu})"><i class="fa fa-bed"></i></button>
                    <button class="btn btn-outline" onclick="toggleHospitalStatus(${h.id}, ${!h.is_active})" title="${h.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="fa fa-power-off"></i>
                    </button>
                    <button class="btn btn-outline" style="color: var(--rose); border-color: var(--rose);" onclick="deleteHospital(${h.id})"><i class="fa fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function filterHospitals() {
    const term = document.getElementById('hospital-search').value.toLowerCase();
    const filtered = allHospitals.filter(h => h.name.toLowerCase().includes(term) || (h.location && h.location.toLowerCase().includes(term)));
    renderHospitals(filtered);
}

function openHospitalModal(id = null) {
    const isEdit = id !== null;
    document.getElementById('hospitalModalTitle').textContent = isEdit ? 'Edit Hospital' : 'Add Hospital';
    document.getElementById('h_id').value = id || '';

    if (isEdit) {
        const h = allHospitals.find(x => x.id === id);
        if (h) {
            document.getElementById('h_name').value = h.name;
            document.getElementById('h_loc').value = h.location;
            document.getElementById('h_contact').value = h.contact || '';
            document.getElementById('h_lat').value = h.latitude;
            document.getElementById('h_lng').value = h.longitude;
            document.getElementById('h_tb').value = h.total_beds;
            document.getElementById('h_ab').value = h.available_beds;
            document.getElementById('h_ticu').value = h.icu_beds;
            document.getElementById('h_aicu').value = h.available_icu;
            document.getElementById('h_active').value = h.is_active ? 'true' : 'false';
        }
    } else {
        document.getElementById('hospital-form').reset();
    }
    toggleModal('hospitalModal', true);
}

async function submitHospital(e) {
    e.preventDefault();
    const hId = document.getElementById('h_id').value;
    const body = {
        name: document.getElementById('h_name').value,
        location: document.getElementById('h_loc').value,
        contact: document.getElementById('h_contact').value,
        latitude: parseFloat(document.getElementById('h_lat').value),
        longitude: parseFloat(document.getElementById('h_lng').value),
        total_beds: parseInt(document.getElementById('h_tb').value),
        available_beds: parseInt(document.getElementById('h_ab').value),
        icu_beds: parseInt(document.getElementById('h_ticu').value),
        available_icu: parseInt(document.getElementById('h_aicu').value),
        is_active: document.getElementById('h_active').value === 'true'
    };

    const method = hId ? 'PUT' : 'POST';
    const url = hId ? `/api/admin/hospitals/${hId}` : `/api/admin/hospitals`;

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Failed to save');
        showToast(data.message, 'success');
        toggleModal('hospitalModal', false);
        fetchAdminHospitals();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openBedUpdateModal(id, name, gen, icu) {
    document.getElementById('b_h_id').value = id;
    document.getElementById('bed-update-hospital-name').textContent = name;
    document.getElementById('b_gen_avail').value = gen;
    document.getElementById('b_icu_avail').value = icu;
    toggleModal('bedUpdateModal', true);
}

async function submitBedUpdate(e) {
    e.preventDefault();
    const hId = document.getElementById('b_h_id').value;
    const h = allHospitals.find(x => x.id == hId);
    if (!h) return;

    h.available_beds = parseInt(document.getElementById('b_gen_avail').value);
    h.available_icu = parseInt(document.getElementById('b_icu_avail').value);

    try {
        const res = await fetch(`/api/admin/hospitals/${hId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify(h)
        });
        if(!res.ok) throw new Error('Failed to update beds');
        showToast('Bed counts updated', 'success');
        toggleModal('bedUpdateModal', false);
        fetchAdminHospitals();
    } catch(err) {
        showToast(err.message, 'error');
    }
}

async function toggleHospitalStatus(hId, newStatus) {
    try {
        const res = await fetch(`/api/admin/hospitals/${hId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify({ is_active: newStatus })
        });
        if (!res.ok) throw new Error('Failed to update status');
        showToast('Hospital status updated', 'success');
        fetchAdminHospitals();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteHospital(hId) {
    if(!confirm("Are you sure you want to delete this hospital? This action cannot be undone.")) return;
    try {
        const res = await fetch(`/api/admin/hospitals/${hId}`, {
            method: 'DELETE',
            headers: { ...getCsrfHeader() }
        });
        if(!res.ok) throw new Error('Failed to delete hospital');
        showToast('Hospital deleted', 'success');
        fetchAdminHospitals();
    } catch(e) { showToast(e.message, 'error'); }
}

// ===== PATIENTS LOGIC =====
let allPatients = [];

async function fetchAdminPatients() {
    try {
        const res = await fetch('/api/admin/patients');
        if (!res.ok) throw new Error('Failed to fetch patients');
        allPatients = await res.json();
        
        const hRes = await fetch('/api/admin/hospitals');
        if (hRes.ok) {
            const hosps = await hRes.json();
            const select = document.getElementById('a_hospital_id');
            if (select) {
                select.innerHTML = '<option value="">Select Hospital</option>' + hosps.filter(h=>h.is_active).map(h => `<option value="${h.id}">${h.name} (Beds: ${h.available_beds})</option>`).join('');
            }
        }
        filterPatients();
    } catch (e) { showToast(e.message, 'error'); }
}

function filterPatients() {
    const term = document.getElementById('patient-search')?.value.toLowerCase() || '';
    const priority = document.getElementById('filter-priority')?.value || 'all';
    const status = document.getElementById('filter-status')?.value || 'all';

    let filtered = allPatients;
    if (term) filtered = filtered.filter(p => p.patient_name.toLowerCase().includes(term) || (p.description && p.description.toLowerCase().includes(term)));
    if (priority !== 'all') filtered = filtered.filter(p => p.priority === priority);
    if (status !== 'all') filtered = filtered.filter(p => p.status === status);

    const tbody = document.getElementById('patients-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    filtered.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td><span class="badge ${p.priority}">${p.priority}</span></td>
                <td><strong>${p.patient_name}</strong></td>
                <td><div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.description || ''}">${p.description || '-'}</div></td>
                <td>${p.requested_at}</td>
                <td style="color: var(--teal);">${p.hospital_name || '-'}</td>
                <td><span class="badge ${p.status}">${p.status}</span></td>
                <td class="admin-actions">
                    <button class="btn btn-outline" onclick="openAssignModal(${p.id})" title="Assign Hospital"><i class="fa fa-hospital"></i></button>
                    <button class="btn btn-outline" onclick="openStatusModal(${p.id}, '${p.status}')" title="Update Status"><i class="fa fa-rotate"></i></button>
                </td>
            </tr>
        `;
    });
}

function openAssignModal(pId) {
    document.getElementById('a_patient_id').value = pId;
    toggleModal('assignModal', true);
}

async function submitAssignHospital(e) {
    e.preventDefault();
    const pId = document.getElementById('a_patient_id').value;
    const hId = document.getElementById('a_hospital_id').value;
    if (!hId) return;

    try {
        const res = await fetch(`/api/admin/patients/${pId}/assign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify({ hospital_id: parseInt(hId) })
        });
        if(!res.ok) throw new Error('Assign Failed');
        showToast('Hospital assigned successfully', 'success');
        toggleModal('assignModal', false);
        fetchAdminPatients();
    } catch(err) { showToast(err.message, 'error'); }
}

function openStatusModal(pId, currStatus) {
    document.getElementById('s_patient_id').value = pId;
    document.getElementById('s_status').value = currStatus;
    toggleModal('statusModal', true);
}

async function submitUpdateStatus(e) {
    e.preventDefault();
    const pId = document.getElementById('s_patient_id').value;
    const status = document.getElementById('s_status').value;
    try {
        const res = await fetch(`/api/admin/patients/${pId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify({ status })
        });
        if(!res.ok) throw new Error('Update Failed');
        showToast('Status updated successfully', 'success');
        toggleModal('statusModal', false);
        fetchAdminPatients();
    } catch(err) { showToast(err.message, 'error'); }
}


// ===== USERS LOGIC =====
let allUsers = [];

async function fetchAdminUsers() {
    try {
        const res = await fetch('/api/admin/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        allUsers = await res.json();
        const badge = document.getElementById('total-users-badge');
        if (badge) badge.textContent = allUsers.length;
        filterUsers();
    } catch (e) { showToast(e.message, 'error'); }
}

function filterUsers() {
    const term = document.getElementById('user-search')?.value.toLowerCase() || '';
    const filtered = term ? allUsers.filter(u => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)) : allUsers;

    const tbody = document.getElementById('users-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    filtered.forEach(u => {
        const roleCls = u.role === 'admin' ? 'admin' : (u.role === 'hospital' ? 'hospital' : 'user');
        const stCls = u.is_active ? 'active' : 'inactive';
        const hospName = u.hospital_name || (u.hospital_id ? `Hospital #${u.hospital_id}` : '-');

        tbody.innerHTML += `
            <tr>
                <td>${u.id}</td>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td><span class="role-badge ${roleCls}">${u.role.toUpperCase()}</span></td>
                <td><small style="color: var(--teal); font-weight: 500;">${hospName}</small></td>
                <td><span class="status-badge ${stCls}">${u.is_active?'Active':'Inactive'}</span></td>
                <td>${u.created_at || '-'}</td>
                <td>${u.health_entries} <a href="#" onclick="viewHealthData(${u.id}); return false;" style="color: var(--teal); margin-left: 8px;"><i class="fa fa-eye"></i></a></td>
                <td class="admin-actions">
                    <button class="btn btn-outline" onclick="toggleUserStatus(${u.id}, ${!u.is_active})" title="${u.is_active ? 'Deactivate' : 'Activate'}"><i class="fa ${u.is_active ? 'fa-ban' : 'fa-check'}"></i></button>
                    <button class="btn btn-outline" onclick="openRoleModal(${u.id}, '${u.name.replace(/'/g, "\\'")}', '${u.role}', ${u.hospital_id || 'null'})" title="Change Role"><i class="fa fa-id-card"></i></button>
                </td>
            </tr>
        `;
    });
}

async function toggleUserStatus(uId, isActive) {
    try {
        const res = await fetch(`/api/admin/users/${uId}/status`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json', ...getCsrfHeader()},
            body: JSON.stringify({is_active: isActive})
        });
        if(!res.ok) throw new Error("Failed to update user status");
        fetchAdminUsers();
    } catch(e) { showToast(e.message, 'error'); }
}

let currentEditUserId = null;
async function openRoleModal(uId, name, currRole, currHospitalId) {
    currentEditUserId = uId;
    document.getElementById('r_user_name').textContent = name;
    const roleSelect = document.getElementById('role_select');
    if (roleSelect) roleSelect.value = currRole || 'user';
    
    // Load hospitals for picker
    const hospSelect = document.getElementById('role_hospital_id');
    if (hospSelect && hospSelect.options.length <= 1) {
        try {
            const res = await fetch('/api/admin/hospitals');
            if (res.ok) {
                const hosps = await res.json();
                hospSelect.innerHTML = '<option value="">-- Choose Hospital --</option>' +
                    hosps.map(h => `<option value="${h.id}">${h.name} (${h.location})</option>`).join('');
            }
        } catch(e) {}
    }
    if (hospSelect && currHospitalId) {
        hospSelect.value = currHospitalId;
    }
    const pickerGroup = document.getElementById('role_hospital_picker_group');
    if (pickerGroup) {
        pickerGroup.style.display = (currRole === 'hospital') ? 'block' : 'none';
    }
    toggleModal('roleModal', true);
}

function onRoleSelectChange() {
    const role = document.getElementById('role_select').value;
    const pickerGroup = document.getElementById('role_hospital_picker_group');
    if (pickerGroup) {
        pickerGroup.style.display = (role === 'hospital') ? 'block' : 'none';
    }
}

async function submitRoleChange(e) {
    if (e) e.preventDefault();
    if (!currentEditUserId) return;
    const role = document.getElementById('role_select').value;
    let hospitalId = null;
    if (role === 'hospital') {
        const val = document.getElementById('role_hospital_id').value;
        if (!val) {
            showToast('Please select a hospital to assign', 'error');
            return;
        }
        hospitalId = parseInt(val);
    }

    try {
        const res = await fetch(`/api/admin/users/${currentEditUserId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify({ role, hospital_id: hospitalId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user role');
        toggleModal('roleModal', false);
        fetchAdminUsers();
        showToast('Role updated successfully', 'success');
    } catch(e) {
        showToast(e.message, 'error');
    }
}

async function viewHealthData(uId) {
    try {
        const res = await fetch(`/api/admin/users/${uId}/health`);
        if(!res.ok) throw new Error("Error fetching user health");
        const data = await res.json();
        
        document.getElementById('avg_stress').textContent = data.avg_stress ? parseInt(data.avg_stress) : 0;
        document.getElementById('avg_sleep').textContent = data.avg_sleep ? parseFloat(data.avg_sleep).toFixed(1) + 'h' : '0h';
        
        const tbody = document.getElementById('health-history-body');
        tbody.innerHTML = '';
        if (data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No health data available</td></tr>';
        } else {
            data.history.forEach(h => {
                tbody.innerHTML += `
                    <tr>
                        <td>${h.date}</td>
                        <td>${h.stress_level}</td>
                        <td>${h.sleep_hours}h</td>
                        <td>${h.steps}</td>
                        <td>${h.productivity_score}</td>
                    </tr>
                `;
            });
        }
        toggleModal('healthDataModal', true);
    } catch(e) { showToast(e.message, 'error'); }
}


// ===== HOSPITAL APPLICATIONS LOGIC =====
let allApplications = [];
let applicationMap = null;
let applicationMarker = null;

async function fetchAdminApplications(status = 'all') {
    try {
        const res = await fetch(`/api/admin/applications?status=${status}`);
        if (!res.ok) throw new Error('Failed to fetch applications');
        allApplications = await res.json();
        renderApplications(allApplications);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderApplications(apps) {
    const tbody = document.getElementById('applications-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!apps || apps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">No applications found.</td></tr>';
        return;
    }
    apps.forEach(app => {
        let badgeCls = 'medium';
        if (app.status === 'approved') badgeCls = 'low';
        else if (app.status === 'rejected') badgeCls = 'critical';

        tbody.innerHTML += `
            <tr>
                <td><strong>#${app.id}</strong></td>
                <td><strong>${app.hospital_name}</strong> <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">(${app.type})</span></td>
                <td><code>${app.registration_number}</code></td>
                <td>${app.contact_person}</td>
                <td><a href="mailto:${app.email}" style="color: var(--teal);">${app.email}</a><br><small style="color: var(--text-muted);">${app.phone}</small></td>
                <td><span class="badge ${badgeCls}">${app.status.toUpperCase()}</span></td>
                <td>${app.created_at || '-'}</td>
                <td class="admin-actions">
                    <button class="btn btn-outline btn-sm" onclick="openApplicationReviewModal(${app.id})" title="Review Application">
                        <i class="fa fa-magnifying-glass"></i> Review
                    </button>
                </td>
            </tr>
        `;
    });
}

function filterApplications() {
    const status = document.getElementById('filter-app-status')?.value || 'all';
    fetchAdminApplications(status);
}

let currentReviewApp = null;
function openApplicationReviewModal(appId) {
    currentReviewApp = allApplications.find(a => a.id === appId);
    if (!currentReviewApp) return;

    document.getElementById('rev_hosp_name').textContent = currentReviewApp.hospital_name;
    document.getElementById('rev_type').textContent = currentReviewApp.type.toUpperCase();
    document.getElementById('rev_reg_num').textContent = currentReviewApp.registration_number;
    document.getElementById('rev_contact').textContent = `${currentReviewApp.contact_person} (${currentReviewApp.phone}, ${currentReviewApp.email})`;
    document.getElementById('rev_address').textContent = currentReviewApp.address;
    document.getElementById('rev_coords').textContent = `${currentReviewApp.latitude}, ${currentReviewApp.longitude}`;
    document.getElementById('rev_note').value = currentReviewApp.admin_note || '';

    const actionButtons = document.getElementById('rev_action_buttons');
    if (actionButtons) {
        actionButtons.style.display = (currentReviewApp.status === 'pending') ? 'flex' : 'none';
    }
    const statusMsg = document.getElementById('rev_status_message');
    if (statusMsg) {
        if (currentReviewApp.status !== 'pending') {
            statusMsg.style.display = 'block';
            statusMsg.innerHTML = `This application has already been <strong>${currentReviewApp.status}</strong> by ${currentReviewApp.reviewer_name || 'Admin'} on ${currentReviewApp.reviewed_at || ''}.`;
        } else {
            statusMsg.style.display = 'none';
        }
    }

    toggleModal('applicationReviewModal', true);

    // Initialize or re-center Leaflet map preview
    setTimeout(() => {
        const mapContainer = document.getElementById('app-review-map');
        if (!mapContainer || typeof L === 'undefined') return;
        const lat = currentReviewApp.latitude;
        const lng = currentReviewApp.longitude;
        if (!applicationMap) {
            applicationMap = L.map('app-review-map').setView([lat, lng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(applicationMap);
            applicationMarker = L.marker([lat, lng]).addTo(applicationMap);
        } else {
            applicationMap.invalidateSize();
            applicationMap.setView([lat, lng], 14);
            applicationMarker.setLatLng([lat, lng]);
        }
    }, 200);
}

async function submitApplicationDecision(action) {
    if (!currentReviewApp) return;
    const note = document.getElementById('rev_note').value.trim();
    if (action === 'reject' && !note) {
        if (!confirm("Reject without an administrative note explaining the reason?")) return;
    }
    if (!confirm(`Are you sure you want to ${action.toUpperCase()} this hospital registration application?`)) return;

    try {
        const res = await fetch(`/api/admin/applications/${currentReviewApp.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
            body: JSON.stringify({ action, note })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to review application');
        showToast(data.message || `Application ${action}d successfully`, 'success');
        toggleModal('applicationReviewModal', false);
        const status = document.getElementById('filter-app-status')?.value || 'all';
        fetchAdminApplications(status);
        fetchAdminDashboardStats();
    } catch (e) {
        showToast(e.message, 'error');
    }
}


// ===== REPORTS LOGIC =====
async function fetchAdminReports() {
    try {
        const overAPI = await fetch('/api/admin/reports/overview');
        const reqAPI = await fetch('/api/admin/reports/requests');
        const prioAPI = await fetch('/api/admin/reports/priority');
        const hospAPI = await fetch('/api/admin/reports/hospitals');
        const bedsAPI = await fetch('/api/admin/reports/beds');

        if(overAPI.ok) {
            const data = await overAPI.json();
            document.getElementById('r-reqs-week').textContent = data.requests_this_week || 0;
            document.getElementById('r-avg-time').textContent = data.avg_response_time || '--';
            document.getElementById('r-most-used').textContent = data.most_used_hospital || '--';
            document.getElementById('r-busiest-day').textContent = data.busiest_day || '--';
        }

        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--teal').trim() || '#1ABC9C';
        
        const commonOptions = {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#ccc' } } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } }
            }
        };

        if(reqAPI.ok) {
            const data = await reqAPI.json();
            new Chart(document.getElementById('requestsChart'), {
                type: 'bar',
                data: {
                    labels: data.map(d => d.day),
                    datasets: [{ label: 'Emergency Requests', data: data.map(d => d.total), backgroundColor: primaryColor }]
                },
                options: commonOptions
            });
        }

        if(prioAPI.ok) {
            const data = await prioAPI.json();
            const colors = { 'critical': '#ef4444', 'high': '#f97316', 'medium': '#eab308', 'low': '#22c55e' };
            new Chart(document.getElementById('priorityChart'), {
                type: 'doughnut',
                data: {
                    labels: data.map(d => d.priority.toUpperCase()),
                    datasets: [{ data: data.map(d => d.count), backgroundColor: data.map(d => colors[d.priority]) }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#ccc' } } }, borderWidth: 0 }
            });
        }

        if(hospAPI.ok) {
            const data = await hospAPI.json();
            new Chart(document.getElementById('hospitalsChart'), {
                type: 'bar',
                data: {
                    labels: data.map(d => d.name.substring(0, 15)+'...'),
                    datasets: [{ label: 'Requests Assigned', data: data.map(d => d.total_requests), backgroundColor: '#f59e0b' }]
                },
                options: commonOptions
            });
        }

        if(bedsAPI.ok) {
            const data = await bedsAPI.json();
            new Chart(document.getElementById('bedsChart'), {
                type: 'line',
                data: {
                    labels: data.map(d => d.name.substring(0, 10)+'...'),
                    datasets: [
                        { label: 'Available Beds', data: data.map(d => d.available_beds), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4 },
                        { label: 'Total Beds', data: data.map(d => d.total_beds), borderColor: '#64748b', borderDash: [5, 5], fill: false, tension: 0.1 }
                    ]
                },
                options: commonOptions
            });
        }
    } catch(e) { console.error("Reports init failed:", e); }
}

// ===== UTILS =====
function toggleModal(id, show) {
    const m = document.getElementById(id);
    if(m) {
        if(show) m.classList.add('active');
        else m.classList.remove('active');
    }
}

function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebar-overlay');
    if(s) s.classList.toggle('active');
    if(o) o.classList.toggle('active');
}
