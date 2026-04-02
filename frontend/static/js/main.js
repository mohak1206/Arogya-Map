/**
 * HealMaps — Unified Frontend Logic
 * Handles: Theme Toggle, API calls, Geolocation, Charts, Map, all UI interactions
 */

const API_BASE = '/api';
let hospitalMap = null;
let hospitalMarkers = [];
let searchTimeout = null;

// ═══════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════
function getTheme() {
  return localStorage.getItem('healmaps-theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('healmaps-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

function updateThemeIcon(theme) {
  // Update ALL theme toggle buttons on the page
  document.querySelectorAll('#theme-toggle-btn, .theme-toggle').forEach(btn => {
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
  });
}

function initTheme() {
  const saved = getTheme();
  setTheme(saved);
}

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast-success');
  else if (type === 'error') toast.classList.add('toast-error');
  else toast.classList.add('toast-info');
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 4500);
}

// ═══════════════════════════════════════════════════════════
// API FETCH WRAPPER
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// SESSION / USER
// ═══════════════════════════════════════════════════════════
async function checkSession() {
  try {
    const user = await apiFetch('/user');
    // Update all user name elements
    document.querySelectorAll('#user-name, .user-name-sidebar').forEach(el => {
      el.innerText = user.name;
    });
    // Update all avatars
    document.querySelectorAll('#user-avatar, .user-avatar').forEach(el => {
      if (!el.querySelector('i')) { // Skip elements with icons inside
        el.innerText = user.name ? user.name.charAt(0).toUpperCase() : 'U';
      }
    });
    // Update email
    const emailEl = document.getElementById('user-email');
    if (emailEl) emailEl.innerText = user.email || 'user@email.com';
    return user;
  } catch (err) {
    // If on protected pages, redirect
    const path = window.location.pathname;
    if (path === '/dashboard' || path === '/hospitals') {
      window.location.href = '/';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// AUTH HANDLERS
// ═══════════════════════════════════════════════════════════
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  if (btn) btn.disabled = true;

  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());

  try {
    const data = await apiFetch('/login', { method: 'POST', body: JSON.stringify(body) });
    showToast('Login successful! Redirecting...');
    setTimeout(() => window.location.href = '/dashboard', 1000);
  } catch (err) {
    if (btn) btn.disabled = false;
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = document.getElementById('signup-btn');
  if (btn) btn.disabled = true;

  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());

  if (body.password !== body.confirm_password) {
    showToast("Passwords don't match", 'error');
    if (btn) btn.disabled = false;
    return;
  }

  try {
    await apiFetch('/register', { method: 'POST', body: JSON.stringify(body) });
    showToast('Account created! Redirecting to login...');
    setTimeout(() => window.location.href = '/', 2000);
  } catch (err) {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await apiFetch('/logout', { method: 'POST' });
    showToast('Logged out successfully');
    setTimeout(() => window.location.href = '/', 500);
  } catch (err) {}
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD INITIALIZATION
// ═══════════════════════════════════════════════════════════
async function initDashboard() {
  await checkSession();
  loadHealthData();
  loadHospitals();
}

// ═══════════════════════════════════════════════════════════
// HEALTH DATA & CHARTS
// ═══════════════════════════════════════════════════════════
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
  const stepsVal = document.getElementById('steps-val');
  const screenVal = document.getElementById('screen-time-val');

  if (stressVal) animateCounter(stressVal, latest.stress_level, '%');
  if (prodVal) animateCounter(prodVal, latest.productivity_score, '%');
  if (sleepVal) {
    sleepVal.innerText = `${latest.sleep_hours} hrs`;
    const statusEl = document.getElementById('sleep-status');
    const trendEl = document.getElementById('sleep-trend');
    if (statusEl) {
      statusEl.innerText = latest.sleep_hours >= 7 ? '😊 Good quality' : latest.sleep_hours >= 5 ? '😐 Average' : '😴 Need more sleep';
    }
    if (trendEl) {
      trendEl.className = latest.sleep_hours >= 7 ? 'stat-trend up' : 'stat-trend down';
      trendEl.innerHTML = latest.sleep_hours >= 7
        ? '<i class="fa fa-arrow-up"></i> Good'
        : '<i class="fa fa-arrow-down"></i> Low';
    }
  }
  if (stepsVal) animateCounter(stepsVal, latest.steps, '');
  if (screenVal) screenVal.innerText = `${latest.screen_time_hours} hrs`;

  // Update stress tips dynamically
  updateStressTips(latest.stress_level);
}

function animateCounter(element, target, suffix) {
  let current = 0;
  const step = Math.ceil(target / 40);
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    element.innerText = current.toLocaleString() + suffix;
  }, 25);
}

function updateStressTips(stressLevel) {
  const tipList = document.getElementById('stress-tip-list');
  if (!tipList) return;

  let tips = [];
  if (stressLevel > 70) {
    tips = [
      '🧘 Immediate 15-minute meditation session',
      '🚶 Take a 30-minute walk in nature',
      '📵 Digital detox for 2 hours',
      '😴 Aim for 9 hours of sleep tonight',
      '💧 Stay hydrated — drink 8 glasses of water'
    ];
  } else if (stressLevel > 40) {
    tips = [
      '🧘 10-minute mindful breathing exercise',
      '📱 Reduce screen time by 1 hour',
      '😴 Prioritize 8 hours of sleep tonight',
      '🚶 Take a 15-minute walk outside',
      '🎵 Listen to calming music'
    ];
  } else {
    tips = [
      '✅ Great stress level! Keep it up',
      '🏃 Maintain your exercise routine',
      '😊 Practice gratitude journaling',
      '🥗 Eat a balanced meal',
      '👫 Spend time with loved ones'
    ];
  }

  tipList.innerHTML = tips.map(tip =>
    `<li><i class="fa fa-check-circle" style="color: var(--teal);"></i> ${tip}</li>`
  ).join('');
}

function renderCharts(rows) {
  const ctxSleep = document.getElementById('sleepChart');
  const ctxSteps = document.getElementById('stepsChart');
  const ctxScreen = document.getElementById('screenChart');

  if (!ctxSleep && !ctxSteps && !ctxScreen) return;

  const sorted = [...rows].reverse();
  const labels = sorted.map(r => {
    const d = new Date(r.date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });

  const isDark = getTheme() === 'dark';
  const gridColor = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  if (ctxSleep) {
    new Chart(ctxSleep, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Sleep Hours',
          data: sorted.map(r => r.sleep_hours),
          borderColor: '#00d4aa',
          backgroundColor: 'rgba(0, 212, 170, 0.1)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#00d4aa',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: gridColor }, ticks: { color: textColor } },
          x: { grid: { display: false }, ticks: { color: textColor } }
        }
      }
    });
  }

  if (ctxSteps) {
    new Chart(ctxSteps, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Steps',
          data: sorted.map(r => r.steps),
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, '#00d4aa');
            gradient.addColorStop(1, '#3b82f6');
            return gradient;
          },
          borderRadius: 8,
          barThickness: 20
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: gridColor }, ticks: { color: textColor } },
          x: { grid: { display: false }, ticks: { color: textColor } }
        }
      }
    });
  }

  if (ctxScreen) {
    const latest = rows[0];
    new Chart(ctxScreen, {
      type: 'doughnut',
      data: {
        labels: ['Screen Time', 'Free Time'],
        datasets: [{
          data: [latest.screen_time_hours, Math.max(0, 16 - latest.screen_time_hours)],
          backgroundColor: ['#f43f5e', '#00d4aa'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '75%',
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// HOSPITAL LOADING & RENDERING
// ═══════════════════════════════════════════════════════════
async function loadHospitals(lat = null, lng = null) {
  let endpoint = '/hospitals';
  if (lat && lng) endpoint = `/hospitals/nearest?lat=${lat}&lng=${lng}`;

  try {
    const data = await apiFetch(endpoint);
    renderHospitals(data.hospitals);
    updateMapMarkers(data.hospitals, lat, lng);
    const countEl = document.getElementById('hospitals-count');
    if (countEl) countEl.innerText = `${data.hospitals.length} Hospitals Found`;
  } catch (err) {}
}

function renderHospitals(hospitals) {
  const container = document.getElementById('hospital-list');
  if (!container) return;
  container.innerHTML = '';

  if (hospitals.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 48px;">
        <i class="fa fa-hospital" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px;"></i>
        <h3 style="color: var(--text-muted);">No hospitals found</h3>
        <p style="color: var(--text-muted); margin-top: 8px;">Try adjusting your search or enable location services.</p>
      </div>
    `;
    return;
  }

  hospitals.forEach((h, index) => {
    const card = document.createElement('div');
    card.className = 'glass-card hospital-card reveal';
    card.style.animationDelay = `${index * 0.05}s`;

    const isAvailable = h.available_beds > 0;
    const badgeClass = isAvailable ? 'badge-available' : 'badge-full';
    const badgeText = isAvailable ? 'AVAILABLE' : 'FULL';
    const distText = h.distance_km != null ? `${h.distance_km} km away` : h.location;
    const occupancy = h.total_beds > 0 ? Math.round(((h.total_beds - h.available_beds) / h.total_beds) * 100) : 0;

    card.innerHTML = `
      <div class="hospital-header">
        <h3>${h.name}</h3>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="hospital-location">
        <i class="fa fa-location-dot"></i>
        <span>${distText}</span>
        ${h.speciality ? `<span class="badge badge-speciality" style="margin-left: 8px;">${h.speciality}</span>` : ''}
      </div>
      <div class="hospital-stats">
        <div class="hospital-stat">
          <div class="stat-num" style="color: ${isAvailable ? 'var(--emerald)' : 'var(--rose)'};">${h.available_beds}</div>
          <div class="stat-lbl">Beds</div>
        </div>
        <div class="hospital-stat">
          <div class="stat-num" style="color: var(--blue);">${h.available_icu}</div>
          <div class="stat-lbl">ICU</div>
        </div>
        <div class="hospital-stat">
          <div class="stat-num" style="color: var(--purple);">${h.available_ventilators}</div>
          <div class="stat-lbl">Ventilators</div>
        </div>
      </div>
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
          <span style="color: var(--text-muted);">Occupancy</span>
          <span style="font-weight: 600;">${occupancy}%</span>
        </div>
        <div style="height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${occupancy}%; background: ${occupancy > 80 ? 'var(--rose)' : occupancy > 50 ? 'var(--amber)' : 'var(--emerald)'}; border-radius: 3px; transition: width 0.5s ease;"></div>
        </div>
      </div>
      ${h.contact ? `<div style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 12px;"><i class="fa fa-phone" style="color: var(--teal);"></i> ${h.contact}</div>` : ''}
      <div class="hospital-actions">
        <button class="btn btn-primary btn-sm" onclick="openBedModal(${h.id}, '${h.name.replace(/'/g, "\\'")}')" ${!isAvailable ? 'disabled' : ''}>
          <i class="fa fa-bed"></i> Book Bed
        </button>
        <button class="btn btn-outline btn-sm" onclick="getDirections(${h.latitude}, ${h.longitude}, '${h.name.replace(/'/g, "\\'")}')">
          <i class="fa fa-diamond-turn-right"></i> Directions
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Trigger reveal animations
  setTimeout(() => initScrollReveal(), 100);
}

// ═══════════════════════════════════════════════════════════
// HOSPITAL SEARCH
// ═══════════════════════════════════════════════════════════
function debounceSearch(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (query.trim().length === 0) {
      loadHospitals();
    } else {
      searchHospitalsByQuery(query);
    }
  }, 400);
}

function searchHospitals() {
  const input = document.getElementById('hospital-search');
  if (input && input.value.trim()) {
    searchHospitalsByQuery(input.value.trim());
  } else {
    loadHospitals();
  }
}

async function searchHospitalsByQuery(query) {
  try {
    const data = await apiFetch(`/hospitals/search?q=${encodeURIComponent(query)}`);
    renderHospitals(data.hospitals);
    updateMapMarkers(data.hospitals);
    const countEl = document.getElementById('hospitals-count');
    if (countEl) countEl.innerText = `${data.hospitals.length} Hospitals Found`;
  } catch (err) {}
}

// ═══════════════════════════════════════════════════════════
// GEOLOCATION — USE MY LOCATION
// ═══════════════════════════════════════════════════════════
function useMyLocation() {
  const btn = document.getElementById('location-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Detecting...';
  }

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-location-crosshairs"></i> Use My Location';
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      showToast('Location detected! Finding nearest hospitals...', 'info');
      loadHospitals(lat, lng);

      // Update location display
      const statusEl = document.getElementById('location-status');
      const coordsEl = document.getElementById('location-coords');
      if (statusEl) statusEl.innerText = '📍 Location Detected';
      if (coordsEl) coordsEl.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-location-crosshairs"></i> Update Location';
      }
    },
    (error) => {
      let msg = 'Unable to detect location.';
      if (error.code === 1) msg = 'Location permission denied. Please allow location access.';
      else if (error.code === 2) msg = 'Location unavailable. Please try again.';
      else if (error.code === 3) msg = 'Location request timed out.';
      showToast(msg, 'error');

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-location-crosshairs"></i> Use My Location';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// ═══════════════════════════════════════════════════════════
// DIRECTIONS
// ═══════════════════════════════════════════════════════════
function getDirections(lat, lng, name) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(name)}`;
  window.open(url, '_blank');
  showToast(`Opening directions to ${name}`, 'info');
}

// ═══════════════════════════════════════════════════════════
// BED REQUEST
// ═══════════════════════════════════════════════════════════
function openBedModal(hospitalId, hospitalName) {
  document.getElementById('bed-hospital-id').value = hospitalId;
  document.getElementById('bed-hospital-name').innerText = hospitalName;
  toggleModal('bedModal', true);
}

async function submitBedRequest(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const hospitalId = formData.get('hospital_id');
  const body = {
    patient_name: formData.get('patient_name'),
    bed_type: formData.get('bed_type')
  };

  try {
    const data = await apiFetch(`/hospitals/${hospitalId}/request-bed`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    showToast(data.message);
    toggleModal('bedModal', false);
    e.target.reset();
    // Refresh the hospital list
    loadHospitals();
  } catch (err) {}
}

// ═══════════════════════════════════════════════════════════
// EMERGENCY REQUEST
// ═══════════════════════════════════════════════════════════
async function handleEmergency(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());

  const btn = document.getElementById('send-emergency-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Processing...';
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        body.lat = pos.coords.latitude;
        body.lng = pos.coords.longitude;
        await submitEmergency(body, e.target, btn);
      },
      async () => {
        await submitEmergency(body, e.target, btn);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else {
    await submitEmergency(body, e.target, btn);
  }
}

async function submitEmergency(body, form, btn) {
  try {
    const data = await apiFetch('/emergency', { method: 'POST', body: JSON.stringify(body) });

    // Show result modal
    const resultContent = document.getElementById('emergency-result-content');
    if (resultContent) {
      resultContent.innerHTML = `
        <div class="glass-card" style="margin-top: 16px;">
          <div style="display: grid; gap: 12px;">
            <div><strong>Assigned Hospital:</strong> ${data.assigned_hospital}</div>
            <div><strong>Priority:</strong> <span class="badge badge-speciality">${data.priority.toUpperCase()}</span></div>
            <div><strong>Distance:</strong> <span class="badge badge-distance">${data.distance_km} km</span></div>
            ${data.hospital_contact ? `<div><strong>Contact:</strong> ${data.hospital_contact}</div>` : ''}
            ${data.hospital_location ? `<div><strong>Location:</strong> ${data.hospital_location}</div>` : ''}
          </div>
        </div>
      `;
      toggleModal('emergencyResultModal', true);
    } else {
      showToast(`${data.message} Assigned: ${data.assigned_hospital}`);
    }

    form.reset();
  } catch (err) {} finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-paper-plane"></i> SEND EMERGENCY REQUEST';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// HEALTH ENTRY
// ═══════════════════════════════════════════════════════════
async function handleHealthEntry(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());

  try {
    await apiFetch('/health', { method: 'POST', body: JSON.stringify(body) });
    showToast('Health data saved successfully!');
    toggleModal('healthModal', false);
    e.target.reset();
    loadHealthData();
  } catch (err) {}
}

// ═══════════════════════════════════════════════════════════
// CONTACT FORM
// ═══════════════════════════════════════════════════════════
async function handleContact(e) {
  e.preventDefault();
  const btn = document.getElementById('send-msg-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Sending...';
  }

  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());

  try {
    await apiFetch('/contact', { method: 'POST', body: JSON.stringify(body) });
    showToast('Message sent successfully! We\'ll get back to you soon.');
    e.target.reset();
  } catch (err) {} finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════
function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (show) {
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } else {
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
    e.target.classList.remove('show');
    document.body.style.overflow = '';
  }
});

// ═══════════════════════════════════════════════════════════
// PASSWORD TOGGLE
// ═══════════════════════════════════════════════════════════
function togglePassword(inputId, toggle) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    toggle.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    toggle.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR TOGGLE
// ═══════════════════════════════════════════════════════════
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('show');
  if (overlay) overlay.classList.toggle('show');
}

function toggleMobileMenu() {
  const links = document.getElementById('nav-links');
  const hamburger = document.getElementById('hamburger');
  if (links) links.classList.toggle('show');
  if (hamburger) hamburger.classList.toggle('active');
}

// ═══════════════════════════════════════════════════════════
// LEAFLET MAP
// ═══════════════════════════════════════════════════════════
function initHospitalMap() {
  const mapEl = document.getElementById('hospital-map');
  if (!mapEl || typeof L === 'undefined') return;

  hospitalMap = L.map('hospital-map').setView([22.5, 78.5], 5); // India center

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(hospitalMap);

  // Load hospitals for the map
  loadHospitals();

  // Auto-detect location
  setTimeout(() => useMyLocation(), 1000);
}

function updateMapMarkers(hospitals, userLat = null, userLng = null) {
  if (!hospitalMap) return;

  // Clear existing markers
  hospitalMarkers.forEach(m => hospitalMap.removeLayer(m));
  hospitalMarkers = [];

  // Custom hospital icon
  const hospitalIcon = L.divIcon({
    html: '<div style="background: var(--teal, #00d4aa); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; box-shadow: 0 2px 10px rgba(0,212,170,0.4); border: 2px solid white;"><i class="fa fa-hospital"></i></div>',
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20]
  });

  const userIcon = L.divIcon({
    html: '<div style="background: #3b82f6; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; box-shadow: 0 2px 10px rgba(59,130,246,0.4); border: 3px solid white; animation: sos-pulse 2s infinite;"><i class="fa fa-user"></i></div>',
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22]
  });

  // Add user marker
  if (userLat && userLng) {
    const userMarker = L.marker([userLat, userLng], { icon: userIcon })
      .addTo(hospitalMap)
      .bindPopup('<strong>📍 Your Location</strong>');
    hospitalMarkers.push(userMarker);
  }

  // Add hospital markers
  const bounds = [];
  hospitals.forEach(h => {
    if (h.latitude && h.longitude) {
      const isAvailable = h.available_beds > 0;
      const marker = L.marker([h.latitude, h.longitude], { icon: hospitalIcon })
        .addTo(hospitalMap)
        .bindPopup(`
          <div style="min-width: 200px; font-family: Inter, sans-serif;">
            <strong style="font-size: 14px;">${h.name}</strong>
            <p style="font-size: 12px; color: #666; margin: 4px 0;">${h.location}</p>
            <div style="display: flex; gap: 8px; margin: 8px 0;">
              <span style="background: ${isAvailable ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)'}; color: ${isAvailable ? '#10b981' : '#f43f5e'}; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;">${isAvailable ? 'AVAILABLE' : 'FULL'}</span>
            </div>
            <div style="font-size: 12px;">
              <div>🛏️ Beds: <strong>${h.available_beds}</strong>/${h.total_beds}</div>
              <div>🏥 ICU: <strong>${h.available_icu}</strong></div>
              <div>💨 Ventilators: <strong>${h.available_ventilators}</strong></div>
              ${h.distance_km != null ? `<div>📏 Distance: <strong>${h.distance_km} km</strong></div>` : ''}
            </div>
            ${h.contact ? `<div style="margin-top: 8px; font-size: 12px;">📞 ${h.contact}</div>` : ''}
          </div>
        `);
      hospitalMarkers.push(marker);
      bounds.push([h.latitude, h.longitude]);
    }
  });

  if (userLat && userLng) bounds.push([userLat, userLng]);

  // Fit map to show all markers
  if (bounds.length > 0) {
    hospitalMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }
}

// ═══════════════════════════════════════════════════════════
// SCROLL REVEAL ANIMATION
// ═══════════════════════════════════════════════════════════
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal:not(.visible)');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  reveals.forEach(el => observer.observe(el));
}

// ═══════════════════════════════════════════════════════════
// PARTICLES ANIMATION
// ═══════════════════════════════════════════════════════════
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (Math.random() * 10 + 8) + 's';
    particle.style.animationDelay = Math.random() * 8 + 's';
    particle.style.width = (Math.random() * 4 + 3) + 'px';
    particle.style.height = particle.style.width;
    container.appendChild(particle);
  }
}

// ═══════════════════════════════════════════════════════════
// NAVBAR SCROLL EFFECT
// ═══════════════════════════════════════════════════════════
function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ═══════════════════════════════════════════════════════════
// GLOBAL INITIALIZATION
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  initTheme();

  // Particles
  initParticles();

  // Scroll effects
  initScrollReveal();
  initNavbarScroll();

  // Page-specific initialization
  const path = window.location.pathname;
  if (path === '/dashboard') {
    initDashboard();
  } else if (path === '/hospitals') {
    checkSession();
    // Map init handled by page-specific script
  } else if (path === '/about' || path === '/contact') {
    // No session required
  } else {
    // Login / signup — no session check needed
  }
});
