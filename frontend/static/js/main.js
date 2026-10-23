/**
 * Arogya Map — Unified Frontend Logic
 * Handles: Theme Toggle, API calls, Geolocation, Charts, Map, all UI interactions
 */

const API_BASE = '/api';
let hospitalMap = null;
let markerLayerGroup = null;
let userMarker = null;
let userRadiusCircle = null;
let userLocationWatcherId = null;
let pollingIntervalId = null;
let currentUserLat = null;
let currentUserLng = null;
let lastFetchedLat = null;
let lastFetchedLng = null;
let currentSearchRadius = 10; // km
let currentFacilityFilter = 'all'; // 'all' | 'hospital' | 'clinic' | 'icu' | 'open_beds'
let allFetchedFacilities = [];
let dbFacilities = [];
let osmFacilities = [];
let activeAbortController = null;
let activeOsmAbortController = null;
let radiusDebounceTimeout = null;
let markerMapById = new Map();
let initialFitDone = false;
let searchTimeout = null;
let sseEventSource = null;

// ═══════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════
function getTheme() {
  return localStorage.getItem('arogyamap-theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('arogyamap-theme', theme);
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
    setTimeout(() => {
      if (data.user && data.user.role === 'admin') {
        window.location.href = '/admin/dashboard';
      } else {
        window.location.href = '/dashboard';
      }
    }, 1000);
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
        labels: ['Sleep Time', 'Screen Time', 'Free Time'],
        datasets: [{
          data: [
            latest.sleep_hours, 
            latest.screen_time_hours, 
            Math.max(0, 24 - latest.sleep_hours - latest.screen_time_hours)
          ],
          backgroundColor: ['#8b5cf6', '#f43f5e', '#00d4aa'],
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
// DISTANCE HELPER
// ═══════════════════════════════════════════════════════════
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ═══════════════════════════════════════════════════════════
// HOSPITAL LOADING & RENDERING (Dashboard compatibility)
// ═══════════════════════════════════════════════════════════
async function loadHospitals(lat = null, lng = null) {
  let endpoint = '/hospitals';
  if (lat && lng) endpoint = `/hospitals?lat=${lat}&lng=${lng}`;

  try {
    const data = await apiFetch(endpoint);
    renderHospitals(data.hospitals);
    const countEl = document.getElementById('hospitals-count');
    if (countEl) countEl.innerText = `${data.hospitals.length} Hospitals Found`;
  } catch (err) {}
}

function renderHospitals(hospitals) {
  const container = document.getElementById('hospital-list');
  if (!container) return;
  container.innerHTML = '';

  if (!hospitals || hospitals.length === 0) {
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

    const isAvailable = (h.available_beds || 0) > 0;
    const badgeClass = isAvailable ? 'badge-available' : 'badge-full';
    const badgeText = isAvailable ? 'AVAILABLE' : 'FULL';
    const distText = h.distance_km != null ? `${h.distance_km} km away` : (h.location || '');
    const occupancy = h.total_beds > 0 ? Math.round(((h.total_beds - h.available_beds) / h.total_beds) * 100) : 0;

    card.innerHTML = `
      <div class="hospital-header">
        <h3>${h.name}</h3>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="hospital-location">
        <i class="fa-solid fa-location-dot"></i>
        <span>${distText}</span>
        ${h.speciality ? `<span class="badge badge-speciality" style="margin-left: 8px;">${h.speciality}</span>` : ''}
      </div>
      <div class="hospital-stats">
        <div class="hospital-stat">
          <div class="stat-num" style="color: ${isAvailable ? 'var(--emerald)' : 'var(--rose)'};">${h.available_beds || 0}</div>
          <div class="stat-lbl">Beds</div>
        </div>
        <div class="hospital-stat">
          <div class="stat-num" style="color: var(--blue);">${h.available_icu || 0}</div>
          <div class="stat-lbl">ICU</div>
        </div>
        <div class="hospital-stat">
          <div class="stat-num" style="color: var(--purple);">${h.available_ventilators || 0}</div>
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
        <button class="btn btn-outline btn-sm" onclick="getDirections(${h.latitude || h.lat}, ${h.longitude || h.lng}, '${h.name.replace(/'/g, "\\'")}')">
          <i class="fa fa-diamond-turn-right"></i> Directions
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  setTimeout(() => initScrollReveal(), 100);
}

// ═══════════════════════════════════════════════════════════
// REAL-TIME LOCATION & NEAREST FACILITIES (PHASE 1 & 2)
// ═══════════════════════════════════════════════════════════

function mergeAndSortFacilities(dbList, osmList) {
  const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const dedupedOsm = [];

  for (const osm of (osmList || [])) {
    let isDup = false;
    const osmNameClean = clean(osm.name);

    for (const db of (dbList || [])) {
      const dist = calculateHaversineDistance(osm.lat, osm.lng, db.lat, db.lng);
      // Under 100m proximity
      if (dist <= 0.10) {
        isDup = true;
        break;
      }
      // Under 150m with similar name
      const dbNameClean = clean(db.name);
      if (dist <= 0.15 && osmNameClean.length >= 3 && dbNameClean.length >= 3) {
        if (osmNameClean.includes(dbNameClean) || dbNameClean.includes(osmNameClean)) {
          isDup = true;
          break;
        }
      }
      // Under 1.0 km with strong name match
      if (dist <= 1.0 && osmNameClean.length >= 5 && dbNameClean.length >= 5) {
        if (osmNameClean === dbNameClean) {
          isDup = true;
          break;
        }
      }
    }

    if (!isDup) {
      dedupedOsm.push(osm);
    }
  }

  const combined = [...(dbList || []), ...dedupedOsm];
  combined.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
  return combined;
}

async function fetchFacilitiesProgressive(isLocationOrRadiusChange = true, showSkeleton = true) {
  if (currentUserLat === null || currentUserLng === null) return;

  const container = document.getElementById('hospital-list');
  if (showSkeleton && container && isLocationOrRadiusChange) {
    container.innerHTML = `
      <div class="glass-card skeleton skeleton-card"></div>
      <div class="glass-card skeleton skeleton-card"></div>
      <div class="glass-card skeleton skeleton-card"></div>
    `;
  }

  // Cancel any prior in-flight DB request
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  const url = `${API_BASE}/hospitals/nearest?lat=${currentUserLat}&lng=${currentUserLng}&radius=${currentSearchRadius}&type=${currentFacilityFilter}&include_osm=false`;

  try {
    const res = await fetch(url, { signal: activeAbortController.signal });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned ${res.status}`);
    }
    const data = await res.json();
    lastFetchedLat = currentUserLat;
    lastFetchedLng = currentUserLng;
    dbFacilities = data.hospitals || [];

    // Immediately render DB partner hospitals
    allFetchedFacilities = mergeAndSortFacilities(dbFacilities, osmFacilities);
    applyFilterAndRender();

    // Launch background OSM facility fetch on location or radius change
    if (isLocationOrRadiusChange) {
      fetchOsmFacilitiesBackground(currentUserLat, currentUserLng, currentSearchRadius, currentFacilityFilter);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Failed to load registered partner hospitals:', err);
    if (container && (!allFetchedFacilities || allFetchedFacilities.length === 0)) {
      container.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: var(--rose); margin-bottom: 12px;"></i>
          <h3>Unable to fetch healthcare facilities</h3>
          <p style="color: var(--text-muted); margin-top: 6px;">${err.message || 'Please check your connection and try again.'}</p>
          <button class="btn btn-primary btn-sm" style="margin-top: 16px;" onclick="fetchFacilitiesProgressive(true, true)">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
        </div>
      `;
    }
  }
}

// Backwards-compatible alias for existing callers
const fetchNearestFacilities = fetchFacilitiesProgressive;

async function fetchOsmFacilitiesBackground(lat, lng, radius, type) {
  if (activeOsmAbortController) {
    activeOsmAbortController.abort();
  }
  activeOsmAbortController = new AbortController();

  const indicator = document.getElementById('osm-loading-indicator');
  const warningEl = document.getElementById('osm-warning-notice');
  const warningText = document.getElementById('osm-warning-text');

  if (indicator) indicator.style.display = 'flex';
  if (warningEl) warningEl.style.display = 'none';

  try {
    const osmUrl = `${API_BASE}/osm/nearest?lat=${lat}&lng=${lng}&radius=${radius}&type=${type}`;
    const res = await fetch(osmUrl, { signal: activeOsmAbortController.signal });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned ${res.status}`);
    }

    const data = await res.json();
    osmFacilities = data.hospitals || [];

    // Merge and re-sort merged facilities by distance
    allFetchedFacilities = mergeAndSortFacilities(dbFacilities, osmFacilities);
    applyFilterAndRender();

    if (data.warnings && data.warnings.length > 0 && osmFacilities.length === 0) {
      if (warningEl) {
        if (warningText) warningText.innerText = "Some nearby clinics couldn't be loaded. Showing registered hospitals.";
        warningEl.style.display = 'flex';
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    // Quiet failure handling without console spam
    if (warningEl) {
      if (warningText) warningText.innerText = "Some nearby clinics couldn't be loaded. Showing registered hospitals.";
      warningEl.style.display = 'flex';
    }
  } finally {
    if (indicator) indicator.style.display = 'none';
  }
}

function retryOsmFetch() {
  if (currentUserLat !== null && currentUserLng !== null) {
    fetchOsmFacilitiesBackground(currentUserLat, currentUserLng, currentSearchRadius, currentFacilityFilter);
  }
}

function dismissOsmWarning() {
  const warningEl = document.getElementById('osm-warning-notice');
  if (warningEl) warningEl.style.display = 'none';
}

function updateChipCounts() {
  const totalCount = allFetchedFacilities.length;
  const hospitalCount = allFetchedFacilities.filter(f => f.type === 'hospital').length;
  const clinicCount = allFetchedFacilities.filter(f => f.type === 'clinic').length;
  const icuCount = allFetchedFacilities.filter(f => (f.available_icu || 0) > 0).length;
  const openBedsCount = allFetchedFacilities.filter(f => (f.available_beds || 0) > 0).length;

  const cAll = document.getElementById('count-all');
  const cHosp = document.getElementById('count-hospital');
  const cClinic = document.getElementById('count-clinic');
  const cIcu = document.getElementById('count-icu');
  const cOpen = document.getElementById('count-open-beds');

  if (cAll) cAll.innerText = totalCount;
  if (cHosp) cHosp.innerText = hospitalCount;
  if (cClinic) cClinic.innerText = clinicCount;
  if (cIcu) cIcu.innerText = icuCount;
  if (cOpen) cOpen.innerText = openBedsCount;
}

function applyFilterAndRender() {
  const container = document.getElementById('hospital-list');
  const countEl = document.getElementById('hospitals-count');
  const searchInput = document.getElementById('hospital-search');
  const searchQuery = (searchInput ? searchInput.value : '').trim().toLowerCase();

  updateChipCounts();

  let filtered = allFetchedFacilities.filter(item => {
    // Filter chip check
    if (currentFacilityFilter === 'hospital' && item.type !== 'hospital') return false;
    if (currentFacilityFilter === 'clinic' && item.type !== 'clinic') return false;
    if (currentFacilityFilter === 'icu' && (item.available_icu || 0) <= 0) return false;
    if (currentFacilityFilter === 'open_beds' && (item.available_beds || 0) <= 0) return false;

    // Search query check
    if (searchQuery) {
      const matchName = (item.name || '').toLowerCase().includes(searchQuery);
      const matchLocation = (item.location || item.address || '').toLowerCase().includes(searchQuery);
      const matchSpeciality = (item.speciality || '').toLowerCase().includes(searchQuery);
      if (!matchName && !matchLocation && !matchSpeciality) return false;
    }

    return true;
  });

  if (countEl) {
    countEl.innerText = `${filtered.length} Facilities Found`;
  }

  // Sync map markers
  updateLayerMarkers(filtered);

  if (!container) return;
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 48px;">
        <i class="fa-solid fa-hospital-user" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px;"></i>
        <h3 style="color: var(--text-primary);">No facilities found within ${currentSearchRadius} km</h3>
        <p style="color: var(--text-muted); margin-top: 8px; max-width: 500px; margin-left: auto; margin-right: auto;">
          Try expanding your search radius to 20 km or resetting the filter chips above.
        </p>
        <div style="margin-top: 16px; display: flex; justify-content: center; gap: 10px;">
          <button class="btn btn-outline btn-sm" onclick="setSearchRadius(20)">
            <i class="fa-solid fa-arrows-spin"></i> Expand to 20 km
          </button>
          <button class="btn btn-ghost btn-sm" onclick="setFacilityFilter('all')">
            <i class="fa-solid fa-filter-circle-xmark"></i> Reset Filter
          </button>
        </div>
      </div>
    `;
    return;
  }

  filtered.forEach((h, index) => {
    const card = document.createElement('div');
    card.className = 'glass-card hospital-card reveal';
    card.id = `card-${h.id}`;
    card.style.animationDelay = `${Math.min(index * 0.04, 0.4)}s`;
    card.onclick = () => selectFacility(h.id, h.lat, h.lng);

    const isPartner = h.source === 'db' || h.live === true;
    const isAvailable = (h.available_beds || 0) > 0;
    const isClinic = h.type === 'clinic';

    let badgeClass = 'badge-osm';
    let badgeText = 'BED DATA UNAVAILABLE';

    if (isPartner) {
      badgeClass = isAvailable ? 'badge-available' : 'badge-full';
      badgeText = isAvailable ? 'LIVE BEDS AVAILABLE' : 'BEDS FULL';
    } else if (isClinic) {
      badgeClass = 'badge-clinic';
      badgeText = 'CLINIC · CALL FIRST';
    }

    const distText = h.distance_km != null ? `${h.distance_km} km away` : (h.location || 'Nearby');
    const occupancy = (h.total_beds && h.total_beds > 0)
      ? Math.round(((h.total_beds - (h.available_beds || 0)) / h.total_beds) * 100)
      : 0;

    card.innerHTML = `
      <div class="hospital-header">
        <div style="flex: 1; padding-right: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <h3>${h.name}</h3>
            ${isPartner ? `
              <span class="badge badge-source-db"><i class="fa-solid fa-circle-check"></i> Live beds</span>
            ` : `
              <span class="badge badge-source-osm"><i class="fa-solid fa-map"></i> OpenStreetMap</span>
            `}
          </div>
          <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
            <span class="badge ${badgeClass}">${badgeText}</span>
            <span class="badge badge-distance"><i class="fa-solid fa-location-dot"></i> ${distText}</span>
          </div>
        </div>
      </div>

      <div class="hospital-location">
        <i class="fa-solid ${isClinic ? 'fa-clinic-medical' : 'fa-hospital'}" style="color: ${isClinic ? 'var(--blue)' : 'var(--teal)'};"></i>
        <span>${h.location || h.address || (isClinic ? 'Clinic / Doctor Practice' : 'Hospital Facility')}</span>
        ${h.speciality ? `<span class="badge badge-speciality" style="margin-left: 8px;">${h.speciality}</span>` : ''}
      </div>

      ${isPartner ? `
        <div class="hospital-stats">
          <div class="hospital-stat">
            <div class="stat-num" style="color: ${isAvailable ? 'var(--emerald)' : 'var(--rose)'};">${h.available_beds || 0}</div>
            <div class="stat-lbl">Available Beds</div>
          </div>
          <div class="hospital-stat">
            <div class="stat-num" style="color: var(--blue);">${h.available_icu || 0}</div>
            <div class="stat-lbl">ICU Beds</div>
          </div>
          <div class="hospital-stat">
            <div class="stat-num" style="color: var(--purple);">${h.available_ventilators || 0}</div>
            <div class="stat-lbl">Ventilators</div>
          </div>
        </div>
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span style="color: var(--text-muted);">Capacity Occupancy</span>
            <span style="font-weight: 600;">${occupancy}%</span>
          </div>
          <div style="height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${occupancy}%; background: ${occupancy > 80 ? 'var(--rose)' : occupancy > 50 ? 'var(--amber)' : 'var(--emerald)'}; border-radius: 3px; transition: width 0.5s ease;"></div>
          </div>
        </div>
      ` : `
        <div class="osm-unconnected-card">
          <i class="fa-solid fa-circle-info" style="color: var(--blue); font-size: 1.1rem; flex-shrink: 0;"></i>
          <div>Not connected to bed system · Bed data unavailable, please call before arrival.</div>
        </div>
      `}

      ${h.phone ? `<div style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 12px;"><i class="fa-solid fa-phone" style="color: var(--teal);"></i> <a href="tel:${h.phone}" style="color: var(--text-primary); font-weight: 500;">${h.phone}</a></div>` : ''}

      <div class="hospital-actions" onclick="event.stopPropagation();">
        ${isPartner ? `
          <button class="btn btn-primary btn-sm" onclick="openBedModal(${h.id}, '${h.name.replace(/'/g, "\\'")}')" ${!isAvailable ? 'disabled' : ''}>
            <i class="fa-solid fa-bed"></i> Book Bed
          </button>
        ` : (h.phone ? `
          <a class="btn btn-primary btn-sm" href="tel:${h.phone}">
            <i class="fa-solid fa-phone"></i> Call
          </a>
        ` : '')}
        <button class="btn btn-outline btn-sm" onclick="getDirections(${h.lat}, ${h.lng}, '${h.name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-diamond-turn-right"></i> Directions
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  setTimeout(() => initScrollReveal(), 100);
}

function updateLayerMarkers(facilities) {
  if (!markerLayerGroup || !hospitalMap) return;

  markerLayerGroup.clearLayers();
  markerMapById.clear();

  facilities.forEach(item => {
    if (!item.lat || !item.lng) return;

    const isPartner = item.source === 'db' || item.live === true;
    const isClinic = item.type === 'clinic';

    let markerClass = 'marker-osm';
    let iconClass = 'fa-solid fa-hospital';

    if (isPartner) {
      markerClass = 'marker-partner';
      iconClass = 'fa-solid fa-hospital';
    } else if (isClinic) {
      markerClass = 'marker-clinic';
      iconClass = 'fa-solid fa-clinic-medical';
    }

    const icon = L.divIcon({
      html: `<div class="map-marker-pin ${markerClass}" id="pin-${item.id}"><i class="${iconClass}"></i></div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -20]
    });

    const isAvailable = (item.available_beds || 0) > 0;
    const distText = item.distance_km != null ? `${item.distance_km} km away` : 'Nearby';

    let bedBadgeHtml = '';
    if (isPartner) {
      bedBadgeHtml = `
        <div style="background: rgba(0, 212, 170, 0.12); padding: 6px 10px; border-radius: 8px; margin: 6px 0; font-size: 11.5px; border: 1px solid rgba(0, 212, 170, 0.25);">
          <div>🛏️ Live Beds: <strong>${item.available_beds}/${item.total_beds}</strong> · ICU: <strong>${item.available_icu}</strong> · Vent: <strong>${item.available_ventilators}</strong></div>
        </div>
      `;
    } else {
      bedBadgeHtml = `
        <div style="background: rgba(100, 116, 139, 0.12); padding: 6px 10px; border-radius: 8px; margin: 6px 0; font-size: 11.5px; color: var(--text-secondary); border: 1px solid rgba(100, 116, 139, 0.2);">
          <i class="fa-solid fa-circle-info"></i> Capacity unknown, call first
        </div>
      `;
    }

    const phoneHtml = item.phone
      ? `<a href="tel:${item.phone}" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 11px;"><i class="fa-solid fa-phone"></i> Call</a>`
      : '';

    const bookBedHtml = (isPartner && isAvailable)
      ? `<button class="btn btn-primary btn-sm" style="padding: 4px 8px; font-size: 11px;" onclick="openBedModal(${item.id}, '${item.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-bed"></i> Book</button>`
      : '';

    const popupHtml = `
      <div style="min-width: 220px; font-family: Inter, sans-serif; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
          <strong style="font-size: 13.5px; color: var(--text-primary);">${item.name}</strong>
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); margin: 3px 0;">
          <i class="fa-solid fa-location-dot" style="color: var(--rose);"></i> ${distText}
        </div>
        ${bedBadgeHtml}
        <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
          ${phoneHtml}
          <a href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}" target="_blank" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 11px;">
            <i class="fa-solid fa-diamond-turn-right"></i> Directions
          </a>
          ${bookBedHtml}
        </div>
      </div>
    `;

    const marker = L.marker([item.lat, item.lng], { icon })
      .bindPopup(popupHtml);

    marker.on('click', () => {
      highlightCard(item.id);
    });

    markerMapById.set(item.id, marker);
    markerLayerGroup.addLayer(marker);
  });
}

function selectFacility(id, lat, lng) {
  if (hospitalMap) {
    hospitalMap.setView([lat, lng], Math.max(hospitalMap.getZoom(), 15), { animate: true });
    const marker = markerMapById.get(id);
    if (marker) {
      marker.openPopup();
    }
  }
  highlightCard(id);
}

function highlightCard(id) {
  document.querySelectorAll('.hospital-card').forEach(c => c.classList.remove('active-selected'));
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.classList.add('active-selected');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ═══════════════════════════════════════════════════════════
// REAL-TIME BED UPDATES VIA SSE (PHASE 3)
// ═══════════════════════════════════════════════════════════
function initRealtimeBedUpdates() {
  if (typeof EventSource === 'undefined') return;

  try {
    if (sseEventSource) {
      sseEventSource.close();
    }
    sseEventSource = new EventSource('/api/hospitals/stream');

    sseEventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.event === 'bed_update') {
          handleLiveBedUpdate(payload);
        }
      } catch (err) {}
    };

    sseEventSource.onerror = () => {
      // Disconnect gracefully; 30s background polling takes over
      console.warn('SSE stream disconnected, fallback to 30s polling.');
    };
  } catch (err) {
    console.warn('SSE initialization error:', err);
  }
}

function handleLiveBedUpdate(data) {
  const facility = allFetchedFacilities.find(f => f.id == data.hospital_id);
  if (facility) {
    if (data.available_beds !== undefined) facility.available_beds = Number(data.available_beds);
    if (data.total_beds !== undefined) facility.total_beds = Number(data.total_beds);
    if (data.available_icu !== undefined) facility.available_icu = Number(data.available_icu);
    if (data.available_ventilators !== undefined) facility.available_ventilators = Number(data.available_ventilators);
  }

  // Update card in DOM
  const card = document.getElementById(`card-${data.hospital_id}`);
  if (card && facility) {
    const isAvail = facility.available_beds > 0;
    const badgeEl = card.querySelector('.badge-available, .badge-full');
    if (badgeEl) {
      badgeEl.className = `badge ${isAvail ? 'badge-available' : 'badge-full'}`;
      badgeEl.innerText = isAvail ? 'LIVE BEDS AVAILABLE' : 'BEDS FULL';
    }
    const statNums = card.querySelectorAll('.stat-num');
    if (statNums.length >= 3) {
      statNums[0].innerText = facility.available_beds;
      statNums[0].style.color = isAvail ? 'var(--emerald)' : 'var(--rose)';
      statNums[1].innerText = facility.available_icu;
      statNums[2].innerText = facility.available_ventilators;
    }

    // Micro-animation indicator on the card
    card.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
    card.style.borderColor = 'var(--teal)';
    card.style.boxShadow = '0 0 15px var(--teal-glow)';
    setTimeout(() => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }, 1200);
  }

  // Update popup
  const marker = markerMapById.get(data.hospital_id);
  if (marker && facility) {
    const isAvailable = facility.available_beds > 0;
    const distText = facility.distance_km != null ? `${facility.distance_km} km away` : 'Nearby';
    const bedBadgeHtml = `
      <div style="background: rgba(0, 212, 170, 0.12); padding: 6px 10px; border-radius: 8px; margin: 6px 0; font-size: 11.5px; border: 1px solid rgba(0, 212, 170, 0.25);">
        <div>🛏️ Live Beds: <strong>${facility.available_beds}/${facility.total_beds}</strong> · ICU: <strong>${facility.available_icu}</strong> · Vent: <strong>${facility.available_ventilators}</strong></div>
      </div>
    `;
    const phoneHtml = facility.phone
      ? `<a href="tel:${facility.phone}" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 11px;"><i class="fa-solid fa-phone"></i> Call</a>`
      : '';
    const bookBedHtml = isAvailable
      ? `<button class="btn btn-primary btn-sm" style="padding: 4px 8px; font-size: 11px;" onclick="openBedModal(${facility.id}, '${facility.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-bed"></i> Book</button>`
      : '';

    marker.setPopupContent(`
      <div style="min-width: 220px; font-family: Inter, sans-serif; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
          <strong style="font-size: 13.5px; color: var(--text-primary);">${facility.name}</strong>
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); margin: 3px 0;">
          <i class="fa-solid fa-location-dot" style="color: var(--rose);"></i> ${distText}
        </div>
        ${bedBadgeHtml}
        <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
          ${phoneHtml}
          <a href="https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}" target="_blank" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 11px;">
            <i class="fa-solid fa-diamond-turn-right"></i> Directions
          </a>
          ${bookBedHtml}
        </div>
      </div>
    `);
  }

  updateChipCounts();
}

// ═══════════════════════════════════════════════════════════
// CONTROLS: RADIUS & FILTERS
// ═══════════════════════════════════════════════════════════

function setSearchRadius(radiusKm) {
  currentSearchRadius = Number(radiusKm);

  document.querySelectorAll('#radius-selector .radius-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.includes(`${radiusKm} km`));
  });

  if (currentUserLat !== null && currentUserLng !== null) {
    updateUserMarkerAndCircle(currentUserLat, currentUserLng);
    if (userRadiusCircle && hospitalMap) {
      hospitalMap.fitBounds(userRadiusCircle.getBounds(), { padding: [25, 25] });
    }

    // Cancel prior pending debounce
    clearTimeout(radiusDebounceTimeout);
    // 300ms debounce on radius change
    radiusDebounceTimeout = setTimeout(() => {
      osmFacilities = []; // Reset OSM list for newly selected radius
      fetchFacilitiesProgressive(true, true);
    }, 300);
  }
}

function setFacilityFilter(filterName) {
  currentFacilityFilter = filterName;

  // Sync lower filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-filter') === filterName);
  });

  // Sync upper quick type selector
  document.querySelectorAll('#type-quick-selector .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === filterName);
  });

  applyFilterAndRender();
}

// ═══════════════════════════════════════════════════════════
// SEARCH & NOMINATIM GEOCODING FALLBACK
// ═══════════════════════════════════════════════════════════

function debounceSearch(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    applyFilterAndRender();
  }, 350);
}

function searchHospitals() {
  handleManualSearch();
}

async function handleManualSearch() {
  const input = document.getElementById('hospital-search');
  if (!input || !input.value.trim()) {
    applyFilterAndRender();
    return;
  }

  const query = input.value.trim();
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
  }

  showToast(`Locating "${query}" via OpenStreetMap Nominatim...`, 'info');

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(nominatimUrl);
    const results = await res.json();

    if (!results || results.length === 0) {
      // Local filter fallback
      applyFilterAndRender();
      showToast(`No coordinates found for "${query}". Filtered local list instead.`, 'info');
      return;
    }

    const place = results[0];
    const newLat = parseFloat(place.lat);
    const newLng = parseFloat(place.lon);

    currentUserLat = newLat;
    currentUserLng = newLng;

    const statusEl = document.getElementById('location-status');
    const coordsEl = document.getElementById('location-coords');
    const iconEl = document.getElementById('location-icon');

    const placeLabel = place.display_name.split(',').slice(0, 3).join(',');
    if (statusEl) statusEl.innerText = `📍 Location: ${placeLabel}`;
    if (coordsEl) coordsEl.innerText = `Lat: ${newLat.toFixed(4)}, Lng: ${newLng.toFixed(4)} (Nominatim Geocoded)`;
    if (iconEl) iconEl.className = 'stat-icon blue';

    updateUserMarkerAndCircle(newLat, newLng);
    if (userRadiusCircle && hospitalMap) {
      hospitalMap.fitBounds(userRadiusCircle.getBounds(), { padding: [25, 25] });
    }

    await fetchNearestFacilities(true);
    showToast(`Showing facilities near ${place.display_name.split(',')[0]}`, 'success');
  } catch (err) {
    console.error('Nominatim geocode error:', err);
    showToast('Geocoding request failed. Filtered local facilities instead.', 'error');
    applyFilterAndRender();
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Search';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// GEOLOCATION — DETECT MY LOCATION BUTTON
// ═══════════════════════════════════════════════════════════
function useMyLocation() {
  const btn = document.getElementById('location-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting...';
  }

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Detect My Location';
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy || 0);

      currentUserLat = lat;
      currentUserLng = lng;

      showToast('Live location updated! Finding nearest facilities...', 'info');

      const statusEl = document.getElementById('location-status');
      const coordsEl = document.getElementById('location-coords');
      const iconEl = document.getElementById('location-icon');
      if (statusEl) statusEl.innerText = 'Live GPS Tracking Active';
      if (coordsEl) coordsEl.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (±${acc}m)`;
      if (iconEl) iconEl.className = 'stat-icon teal';

      if (hospitalMap) {
        updateUserMarkerAndCircle(lat, lng, acc);
        if (userRadiusCircle) {
          hospitalMap.fitBounds(userRadiusCircle.getBounds(), { padding: [25, 25] });
        }
      }
      fetchNearestFacilities(true);

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Update Location';
      }
    },
    (err) => {
      let msg = 'Unable to detect location. Please allow browser location access or search above.';
      if (err.code === 1) msg = 'Location permission denied. Please search your city or pincode.';
      showToast(msg, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Detect My Location';
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
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
// LEAFLET MAP INITIALIZATION & WATCHER
// ═══════════════════════════════════════════════════════════
function initHospitalMap() {
  const mapEl = document.getElementById('hospital-map');
  if (!mapEl || typeof L === 'undefined') return;

  cleanupGeolocationAndPolling();

  // Create Leaflet map centered at default coordinates
  hospitalMap = L.map('hospital-map', {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([19.6967, 72.7670], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(hospitalMap);

  // Initialize marker layer group
  markerLayerGroup = L.layerGroup().addTo(hospitalMap);

  // Start real-time GPS tracking
  startLocationWatcher();

  // Start background 30s polling
  startPolling();

  // Start real-time bed update stream (SSE)
  initRealtimeBedUpdates();

  // Prevent memory leaks on page unload
  window.addEventListener('beforeunload', cleanupGeolocationAndPolling);
  window.addEventListener('pagehide', cleanupGeolocationAndPolling);
}

function startLocationWatcher() {
  const statusEl = document.getElementById('location-status');
  const coordsEl = document.getElementById('location-coords');
  const iconEl = document.getElementById('location-icon');

  if (!navigator.geolocation) {
    if (statusEl) statusEl.innerText = 'Geolocation Not Supported';
    if (coordsEl) coordsEl.innerText = 'Use search box to find facilities by city or pincode';
    showToast('Geolocation is not supported by your browser', 'error');
    fallbackToDefaultLocation(19.6967, 72.7670, 'Palghar (Default)');
    return;
  }

  if (statusEl) statusEl.innerText = 'Acquiring GPS Signal...';
  if (coordsEl) coordsEl.innerText = 'Please allow browser location access';

  userLocationWatcherId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = Math.round(pos.coords.accuracy || 0);

      currentUserLat = lat;
      currentUserLng = lng;

      if (statusEl) statusEl.innerText = 'Live GPS Tracking Active';
      if (coordsEl) coordsEl.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (±${accuracy}m)`;
      if (iconEl) iconEl.className = 'stat-icon teal';

      updateUserMarkerAndCircle(lat, lng, accuracy);

      // Check distance moved since last fetch
      let movedDistanceM = Infinity;
      if (lastFetchedLat !== null && lastFetchedLng !== null) {
        movedDistanceM = calculateHaversineDistance(lat, lng, lastFetchedLat, lastFetchedLng) * 1000;
      }

      // Fetch if moved more than 500m or first fix
      if (lastFetchedLat === null || movedDistanceM > 500) {
        fetchNearestFacilities(true);
      }
    },
    (err) => {
      console.warn('Geolocation error:', err.message);
      let errMsg = 'Location access disabled.';
      if (err.code === 1) {
        errMsg = 'Location permission denied. Use search box below for city or pincode.';
      } else if (err.code === 2) {
        errMsg = 'Location unavailable. Use search box below.';
      } else if (err.code === 3) {
        errMsg = 'Location request timed out. Use search box below.';
      }

      if (statusEl) statusEl.innerText = 'Manual Location Mode';
      if (coordsEl) coordsEl.innerText = errMsg;
      if (iconEl) iconEl.className = 'stat-icon amber';

      // Fall back to default location if initial fetch hasn't run
      if (lastFetchedLat === null) {
        fallbackToDefaultLocation(19.6967, 72.7670, 'Palghar (Default)');
      }
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function updateUserMarkerAndCircle(lat, lng, accuracy = 0) {
  if (!hospitalMap) return;

  const userIcon = L.divIcon({
    html: '<div class="map-marker-pin marker-user" title="You are here"><i class="fa-solid fa-person-circle-check"></i></div>',
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });

  if (!userMarker) {
    userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(hospitalMap);
    userMarker.bindPopup(`
      <div style="font-family: Inter, sans-serif; text-align: center; padding: 4px;">
        <strong style="font-size: 13px;"><i class="fa-solid fa-location-crosshairs" style="color: var(--teal);"></i> You Are Here</strong>
        <p style="font-size: 11px; color: var(--text-muted); margin: 2px 0 0 0;">GPS Accuracy: ±${accuracy}m</p>
      </div>
    `);
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  const radiusMeters = currentSearchRadius * 1000;
  if (!userRadiusCircle) {
    userRadiusCircle = L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#00d4aa',
      fillColor: '#00d4aa',
      fillOpacity: 0.07,
      weight: 1.5,
      dashArray: '5, 5'
    }).addTo(hospitalMap);
  } else {
    userRadiusCircle.setLatLng([lat, lng]);
    userRadiusCircle.setRadius(radiusMeters);
  }

  if (!initialFitDone && userRadiusCircle) {
    hospitalMap.fitBounds(userRadiusCircle.getBounds(), { padding: [25, 25] });
    initialFitDone = true;
  }
}

function fallbackToDefaultLocation(lat, lng, label) {
  currentUserLat = lat;
  currentUserLng = lng;

  const statusEl = document.getElementById('location-status');
  const coordsEl = document.getElementById('location-coords');
  if (statusEl) statusEl.innerText = `Default Location (${label})`;
  if (coordsEl) coordsEl.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} · Use search box to change`;

  updateUserMarkerAndCircle(lat, lng);
  fetchNearestFacilities(true);
}

function startPolling() {
  if (pollingIntervalId !== null) clearInterval(pollingIntervalId);
  pollingIntervalId = setInterval(async () => {
    if (currentUserLat !== null && currentUserLng !== null) {
      // 30s background poll: refresh registered DB bed telemetry ONLY!
      // Do NOT re-query OpenStreetMap on 30s interval to prevent console spam & network load.
      try {
        const url = `${API_BASE}/hospitals/nearest?lat=${currentUserLat}&lng=${currentUserLng}&radius=${currentSearchRadius}&type=${currentFacilityFilter}&include_osm=false`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        dbFacilities = data.hospitals || [];

        // Merge with existing cached OSM facilities without re-querying Overpass
        allFetchedFacilities = mergeAndSortFacilities(dbFacilities, osmFacilities);
        applyFilterAndRender();
      } catch (err) {
        // Silently ignore background poll network hiccups
      }
    }
  }, 30000);
}

function cleanupGeolocationAndPolling() {
  if (userLocationWatcherId !== null) {
    navigator.geolocation.clearWatch(userLocationWatcherId);
    userLocationWatcherId = null;
  }
  if (pollingIntervalId !== null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
  if (sseEventSource) {
    sseEventSource.close();
    sseEventSource = null;
  }
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (activeOsmAbortController) {
    activeOsmAbortController.abort();
    activeOsmAbortController = null;
  }
  if (radiusDebounceTimeout) {
    clearTimeout(radiusDebounceTimeout);
    radiusDebounceTimeout = null;
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
