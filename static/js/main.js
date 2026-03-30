/**
 * HealMaps — Unified Frontend Logic
 * Handles API calls, Charts, Geolocation, and UI interactions.
 */

const API_BASE = '/api';

// --- Toast Notification Helper ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.className = 'toast'; // reset
  toast.classList.add(type === 'success' ? 'status-available' : 'status-full');
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// --- API Fetch Wrapper (with Credentials for Sessions) ---
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultOptions = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  
  try {
    const response = await fetch(url, defaultOptions);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API Error');
    return data;
  } catch (error) {
    console.error('Fetch Error:', error.message);
    showToast(error.message, 'error');
    throw error;
  }
}

// --- Session Check & User Display ---
async function checkSession() {
  try {
    const user = await apiFetch('/user');
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) userNameElement.innerText = user.name;
    return user;
  } catch (err) {
    if (window.location.pathname === '/dashboard') {
      window.location.href = '/'; // redirect to login if on dashboard
    }
  }
}

// --- Auth Handling ---
async function handleLogin(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  
  try {
    await apiFetch('/login', { method: 'POST', body: JSON.stringify(body) });
    window.location.href = '/dashboard';
  } catch (err) {}
}

async function handleSignup(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  
  if (body.password !== body.confirm_password) {
    showToast("Passwords don't match", 'error');
    return;
  }
  
  try {
    await apiFetch('/register', { method: 'POST', body: JSON.stringify(body) });
    showToast('Registration successful! Redirecting...');
    setTimeout(() => window.location.href = '/', 2000);
  } catch (err) {}
}

async function handleLogout() {
  try {
    await apiFetch('/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (err) {}
}

// --- Health Data & Charts ---
async function initDashboard() {
  await checkSession();
  loadHealthData();
  loadHospitals();
}

async function loadHealthData() {
  try {
    const data = await apiFetch('/health');
    const healthRows = data.health_data;
    if (healthRows.length > 0) {
      updateHealthCards(healthRows[0]);
      renderCharts(healthRows);
    }
  } catch (err) {}
}

function updateHealthCards(latest) {
  const stressVal = document.getElementById('stress-val');
  const prodVal = document.getElementById('prod-val');
  const sleepVal = document.getElementById('sleep-val');
  
  if (stressVal) stressVal.innerText = `${latest.stress_level}%`;
  if (prodVal) prodVal.innerText = `${latest.productivity_score}%`;
  if (sleepVal) {
    sleepVal.innerText = `${latest.sleep_hours} hrs`;
    const label = latest.sleep_hours >= 7 ? '(Good)' : '(Poor)';
    document.getElementById('sleep-status').innerText = label;
  }
}

function renderCharts(rows) {
    const ctxSleep = document.getElementById('sleepChart');
    const ctxSteps = document.getElementById('stepsChart');
    const ctxScreen = document.getElementById('screenChart');

    if (!ctxSleep || !ctxSteps || !ctxScreen) return;

    // Reverse rows to show chronological order
    const sorted = [...rows].reverse();
    const labels = sorted.map(r => r.date);

    // Sleep Line Chart
    new Chart(ctxSleep, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sleep Hours',
                data: sorted.map(r => r.sleep_hours),
                borderColor: '#1ABC9C',
                backgroundColor: 'rgba(26, 188, 156, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Steps Bar Chart
    new Chart(ctxSteps, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Steps',
                data: sorted.map(r => r.steps),
                backgroundColor: '#1ABC9C',
                borderRadius: 5
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Screen Time Donut (Latest day)
    const latest = rows[0];
    new Chart(ctxScreen, {
        type: 'doughnut',
        data: {
            labels: ['Screen Time', 'Free Time'],
            datasets: [{
                data: [latest.screen_time_hours, 16 - latest.screen_time_hours],
                backgroundColor: ['#E74C3C', '#1ABC9C'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, cutout: '70%' }
    });
}

// --- Hospital Finder ---
async function loadHospitals(lat = null, lng = null) {
  let endpoint = '/hospitals';
  if (lat && lng) endpoint = `/hospitals/nearest?lat=${lat}&lng=${lng}`;
  
  try {
    const data = await apiFetch(endpoint);
    renderHospitals(data.hospitals);
  } catch (err) {}
}

function renderHospitals(hospitals) {
  const container = document.getElementById('hospital-list');
  if (!container) return;
  container.innerHTML = '';
  
  hospitals.forEach(h => {
    const card = document.createElement('div');
    card.className = 'glass-card hospital-card';
    const statusClass = h.available_beds > 0 ? 'status-available' : 'status-full';
    const statusText = h.available_beds > 0 ? 'AVAILABLE' : 'FULL';
    const distText = h.distance_km ? `${h.distance_km} km away` : h.location;
    
    card.innerHTML = `
      <h3>${h.name}</h3>
      <p style="font-size: 0.9rem; color: #777; margin-bottom: 10px;">${distText}</p>
      <div style="display: flex; gap: 10px; margin-bottom: 15px;">
        <span class="status-badge ${statusClass}">${statusText}</span>
        <span class="status-badge status-available">ICU: ${h.available_icu}</span>
      </div>
      <div style="font-size: 0.9rem; margin-bottom: 20px;">
        <p>Beds: <strong>${h.available_beds}</strong> / ${h.total_beds}</p>
        <p>Ventilators: <strong>${h.available_ventilators}</strong></p>
      </div>
      <button class="btn btn-outline" onclick="requestBed(${h.id})" ${h.available_beds === 0 ? 'disabled' : ''}>Request Bed</button>
    `;
    container.appendChild(card);
  });
}

function useMyLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      loadHospitals(pos.coords.latitude, pos.coords.longitude);
      showToast('Finding nearest hospitals...');
    });
  } else {
    showToast('Geolocation not supported', 'error');
  }
}

// --- Emergency Request ---
async function handleEmergency(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  
  // Get location if possible for better sorting
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async pos => {
      body.lat = pos.coords.latitude;
      body.lng = pos.coords.longitude;
      submitEmergency(body);
    }, () => submitEmergency(body));
  } else {
    submitEmergency(body);
  }
}

async function submitEmergency(body) {
  try {
    const data = await apiFetch('/emergency', { method: 'POST', body: JSON.stringify(body) });
    showToast(`${data.message} Assigned: ${data.assigned_hospital}`);
    document.getElementById('emergency-form').reset();
  } catch (err) {}
}

// --- Modals & UI ---
function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function togglePassword(inputId, toggle) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    toggle.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    toggle.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

// --- Add Health Entry ---
async function handleHealthEntry(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  
  try {
    await apiFetch('/health', { method: 'POST', body: JSON.stringify(body) });
    showToast('Health data updated!');
    toggleModal('healthModal', false);
    loadHealthData();
  } catch (err) {}
}

// --- Contact Form ---
async function handleContact(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  
  try {
    await apiFetch('/contact', { method: 'POST', body: JSON.stringify(body) });
    showToast('Message sent! Thank you.');
    e.target.reset();
  } catch (err) {}
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path === '/dashboard') {
        initDashboard();
    } else {
        checkSession();
    }
});
