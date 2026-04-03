/* admin.js - Logic for the Arogya Map Admin Panel */

// ===== DASHBOARD LOGIC =====
async function fetchAdminDashboardStats() {
    try {
        const response = await fetch('/api/admin/dashboard-stats');
        if (!response.ok) {
            if (response.status === 403) window.location.href = '/dashboard';
            throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        
        document.getElementById('stat-hospitals').textContent = data.total_hospitals;
        document.getElementById('stat-beds').textContent = data.total_beds;
        document.getElementById('stat-requests').textContent = data.requests_today;
        document.getElementById('stat-users').textContent = data.total_users;

        const hospBody = document.getElementById('hospital-capacity-body');
        if (hospBody) {
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
        if (reqBody) {
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
                <td><strong>${h.name}</strong></td>
                <td>${h.location}</td>
                <td>${h.total_beds} / <span style="color: var(--teal); font-weight: bold;">${h.available_beds}</span></td>
                <td>${h.icu_beds} / <span style="color: var(--teal); font-weight: bold;">${h.available_icu}</span></td>
                <td>${status}</td>
                <td class="admin-actions">
                    <button class="btn btn-outline" onclick="openHospitalModal(${h.id})"><i class="fa fa-pen"></i></button>
                    <button class="btn btn-outline" onclick="openBedUpdateModal(${h.id}, '${h.name}', ${h.available_beds}, ${h.available_icu})"><i class="fa fa-bed"></i></button>
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
    const filtered = allHospitals.filter(h => h.name.toLowerCase().includes(term) || h.location.toLowerCase().includes(term));
    renderHospitals(filtered);
}

function openHospitalModal(hId = null) {
    document.getElementById('hospital-form').reset();
    document.getElementById('h_id').value = '';
    document.getElementById('hospital-modal-title').innerHTML = '<i class="fa fa-hospital" style="color: var(--teal);"></i> Add Hospital';

    if (hId) {
        const h = allHospitals.find(x => x.id === hId);
        if (h) {
            document.getElementById('hospital-modal-title').innerHTML = '<i class="fa fa-hospital" style="color: var(--teal);"></i> Edit Hospital';
            document.getElementById('h_id').value = h.id;
            document.getElementById('h_name').value = h.name;
            document.getElementById('h_contact').value = h.contact;
            document.getElementById('h_location').value = h.location;
            document.getElementById('h_lat').value = h.latitude;
            document.getElementById('h_lng').value = h.longitude;
            document.getElementById('h_tb').value = h.total_beds;
            document.getElementById('h_ab').value = h.available_beds;
            document.getElementById('h_ticu').value = h.icu_beds;
            document.getElementById('h_aicu').value = h.available_icu;
            document.getElementById('h_active').value = h.is_active ? "true" : "false";
        }
    }
    toggleModal('hospitalModal', true);
}

async function submitHospitalForm(e) {
    e.preventDefault();
    const hId = document.getElementById('h_id').value;
    const body = {
        name: document.getElementById('h_name').value,
        contact: document.getElementById('h_contact').value,
        location: document.getElementById('h_location').value,
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
            headers: { 'Content-Type': 'application/json' },
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
    
    // Fetch current hosp, patch available_beds
    const h = allHospitals.find(x => x.id == hId);
    if (!h) return;

    h.available_beds = parseInt(document.getElementById('b_gen_avail').value);
    h.available_icu = parseInt(document.getElementById('b_icu_avail').value);

    try {
        const res = await fetch(`/api/admin/hospitals/${hId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch(`/api/admin/hospitals/${hId}`, { method: 'DELETE' });
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
        
        // Also load hospitals for assign select
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
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hospital_id: parseInt(hId) })
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
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
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
        document.getElementById('total-users-badge').textContent = allUsers.length;
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
        const roleCls = u.role === 'admin' ? 'admin' : 'user';
        const stCls = u.is_active ? 'active' : 'inactive';
        tbody.innerHTML += `
            <tr>
                <td>${u.id}</td>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td><span class="role-badge ${roleCls}">${u.role}</span></td>
                <td><span class="status-badge ${stCls}">${u.is_active?'Active':'Inactive'}</span></td>
                <td>${u.created_at || '-'}</td>
                <td>${u.health_entries} <a href="#" onclick="viewHealthData(${u.id}); return false;" style="color: var(--teal); margin-left: 8px;"><i class="fa fa-eye"></i></a></td>
                <td class="admin-actions">
                    <button class="btn btn-outline" onclick="toggleUserStatus(${u.id}, ${!u.is_active})" title=${u.is_active?"Deactivate":"Activate"}><i class="fa ${u.is_active ? 'fa-ban' : 'fa-check'}"></i></button>
                    <button class="btn btn-outline" onclick="askRoleChange(${u.id}, '${u.name}', '${u.role}')" title="Change Role"><i class="fa fa-id-card"></i></button>
                </td>
            </tr>
        `;
    });
}

async function toggleUserStatus(uId, isActive) {
    try {
        const res = await fetch(`/api/admin/users/${uId}/status`, {
            method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({is_active: isActive})
        });
        if(!res.ok) throw new Error("Failed");
        fetchAdminUsers();
    } catch(e) { showToast(e.message, 'error'); }
}

let pendingRoleChange = null;
function askRoleChange(uId, name, currRole) {
    pendingRoleChange = { uId, role: currRole === 'admin' ? 'user' : 'admin' };
    document.getElementById('r_user_name').textContent = name;
    document.getElementById('r_new_role').textContent = pendingRoleChange.role.toUpperCase();
    toggleModal('roleModal', true);
}

async function confirmRoleChange() {
    if (!pendingRoleChange) return;
    try {
        const res = await fetch(`/api/admin/users/${pendingRoleChange.uId}/role`, {
            method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({role: pendingRoleChange.role})
        });
        if(!res.ok) throw new Error("Failed");
        toggleModal('roleModal', false);
        fetchAdminUsers();
        showToast('Role updated', 'success');
    } catch(e) { showToast(e.message, 'error'); }
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
        const darkColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-glass').trim() || 'rgba(30,30,40,0.8)';
        
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
