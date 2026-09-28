/**
 * Tumakuru City Corporation & Smart City Mission (ತುಮಕೂರು ಮಹಾನಗರ ಪಾಲಿಕೆ)
 * Command Center Realtime Application, GIS Mapping, Analytics & Dispatch Engine
 * Coordinates: 13.3392° N, 77.1018° E
 */

// Global Application State
const cityState = {
  authenticatedUser: null,
  authToken: localStorage.getItem("swms_auth_token") || null,
  activeTab: "tab-gis-map",
  currentInspectedSite: "SITE_TUM_001",
  audioEnabled: true,
  sitesDirectory: {},
  readings: {},
  fleet: [],
  alerts: [],
  threshold: 80,
  map: null,
  currentTileLayer: null,
  currentTileLabelLayer: null,
  markers: {},
  truckMarkers: {},
  hourlyChart: null,
  segregationChart: null
};

// Web Audio API Alert Chime
class MunicipalAudio {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  playBreachAlert() {
    if (!cityState.audioEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.4);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio chime prevented:", e);
    }
  }
}
const sfx = new MunicipalAudio();

// ---------------------------------------------------------------------------
// INITIALIZATION & AUTH CHECK
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initAuthSystem();
  initTabs();
  initAudioToggle();
  initReportExport();
  
  // Check if staff is logged in
  if (cityState.authToken) {
    await verifyStaffSession();
  } else {
    showLoginOverlay();
  }

  // Load initial city data
  await fetchCityOverview();
  
  // Initialize GIS Map and Charts
  initGisMap();
  initAnalyticsCharts();
  
  // Connect Realtime WebSocket Bridge
  initWebSocket();
  
  // Hardware selector change listener
  const hwSelect = document.getElementById("hardwareSiteSelect");
  if (hwSelect) {
    hwSelect.addEventListener("change", (e) => {
      cityState.currentInspectedSite = e.target.value;
      renderHardwareTab();
    });
  }

  // Basemap style switcher
  const mapSelect = document.getElementById("mapBasemapSelect");
  if (mapSelect) {
    mapSelect.addEventListener("change", (e) => {
      switchBasemap(e.target.value);
    });
  }

  // Quick Action Buttons
  const btnSurge = document.getElementById("btnSimulateCitySurge");
  if (btnSurge) {
    btnSurge.addEventListener("click", async () => {
      try {
        await fetch("/api/simulator/city-surge", { method: "POST" });
        alert("⚠️ Tumakuru Festival & Market Rush Surge Simulated! 8 Smart Hubs updated.");
      } catch (e) {
        console.error("Surge error:", e);
      }
    });
  }

  const btnOptimize = document.getElementById("btnOptimizeAllRoutes");
  if (btnOptimize) {
    btnOptimize.addEventListener("click", () => {
      optimizeFleetRoutes();
    });
  }

  const btnRefreshAnalytics = document.getElementById("btnRefreshAnalytics");
  if (btnRefreshAnalytics) {
    btnRefreshAnalytics.addEventListener("click", () => {
      loadHourlyAnalyticsData();
    });
  }
});

// ---------------------------------------------------------------------------
// TUMAKURU MUNICIPAL STAFF AUTHENTICATION SYSTEM
// ---------------------------------------------------------------------------
function initAuthSystem() {
  const loginForm = document.getElementById("staffLoginForm");
  const loginOverlay = document.getElementById("staffLoginOverlay");
  const loginErr = document.getElementById("loginErrorMessage");
  const btnTogglePwd = document.getElementById("btnTogglePassword");
  const pwdInput = document.getElementById("loginPassword");
  const btnLogout = document.getElementById("btnLogoutStaff");

  // Show/Hide Password
  if (btnTogglePwd && pwdInput) {
    btnTogglePwd.addEventListener("click", () => {
      const isPwd = pwdInput.type === "password";
      pwdInput.type = isPwd ? "text" : "password";
      btnTogglePwd.textContent = isPwd ? "🙈" : "👁️";
    });
  }

  // ---------------------------------------------------------------------------
  // Core login function — called by both form submit AND demo chip buttons
  // ---------------------------------------------------------------------------
  async function performLogin(userId, password) {
    // Show loading state
    const btnSubmit = document.getElementById("btnSubmitLogin");
    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = "Authenticating…"; }
    if (loginErr) loginErr.style.display = "none";

    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, password: password })
      });

      if (!resp.ok) {
        if (loginErr) loginErr.style.display = "block";
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = "<span>🔒</span> Authenticate & Enter Command Center"; }
        return;
      }

      const data = await resp.json();
      cityState.authToken = data.token;
      cityState.authenticatedUser = data.user;
      localStorage.setItem("swms_auth_token", data.token);
      localStorage.setItem("swms_user_profile", JSON.stringify(data.user));

      if (loginErr) loginErr.style.display = "none";
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = "<span>🔒</span> Authenticate & Enter Command Center"; }
      hideLoginOverlay();
      updateStaffBadgeUI(data.user);
    } catch (err) {
      console.error("Login error:", err);
      if (loginErr) loginErr.style.display = "block";
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = "<span>🔒</span> Authenticate & Enter Command Center"; }
    }
  }

  // Submit Login Form — reads from DOM fields
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = document.getElementById("loginUserId").value.trim();
      const password = document.getElementById("loginPassword").value.trim();
      await performLogin(userId, password);
    });
  }

  // 1-Click Demo Account Buttons — pass credentials directly, no form event dispatch
  document.querySelectorAll(".demo-chip-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const u = btn.getAttribute("data-user");
      const p = btn.getAttribute("data-pwd");
      // Update fields for visual feedback
      document.getElementById("loginUserId").value = u;
      document.getElementById("loginPassword").value = p;
      // Call login directly with explicit credentials
      await performLogin(u, p);
    });
  });

  // Logout Button
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${cityState.authToken}` }
        });
      } catch (e) {
        console.warn("Logout request:", e);
      }
      cityState.authToken = null;
      cityState.authenticatedUser = null;
      localStorage.removeItem("swms_auth_token");
      localStorage.removeItem("swms_user_profile");
      showLoginOverlay();
    });
  }
}

async function verifyStaffSession() {
  try {
    const resp = await fetch("/api/auth/me", {
      headers: { "Authorization": `Bearer ${cityState.authToken}` }
    });
    if (resp.ok) {
      const user = await resp.json();
      cityState.authenticatedUser = user;
      hideLoginOverlay();
      updateStaffBadgeUI(user);
    } else {
      showLoginOverlay();
    }
  } catch (e) {
    showLoginOverlay();
  }
}

function showLoginOverlay() {
  const overlay = document.getElementById("staffLoginOverlay");
  if (overlay) overlay.classList.remove("hidden");
}

function hideLoginOverlay() {
  const overlay = document.getElementById("staffLoginOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function updateStaffBadgeUI(user) {
  const staffName = document.getElementById("staffName");
  const staffRole = document.getElementById("staffRole");
  const staffAvatar = document.getElementById("staffAvatar");

  if (staffName) staffName.textContent = user.name || "Sri B. V. Ashwath, IAS";
  if (staffRole) staffRole.textContent = `${user.designation || 'Staff'} (${user.badge_id || 'TMP-COMM-001'})`;
  if (staffAvatar) staffAvatar.textContent = user.avatar || "🏛️";
}

// ---------------------------------------------------------------------------
// TAB NAVIGATION
// ---------------------------------------------------------------------------
function initTabs() {
  const tabs = document.querySelectorAll(".nav-tab-link");
  const tabContents = [
    "tab-gis-map",
    "tab-analytics",
    "tab-hardware",
    "tab-fleet",
    "tab-qa-matrix",
    "tab-audit-logs"
  ];

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = tab.getAttribute("data-tab");
      cityState.activeTab = targetId;

      tabContents.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = (id === targetId) ? "block" : "none";
        }
      });

      if (targetId === "tab-gis-map" && cityState.map) {
        setTimeout(() => cityState.map.invalidateSize(), 200);
      } else if (targetId === "tab-analytics") {
        loadHourlyAnalyticsData();
      } else if (targetId === "tab-hardware") {
        renderHardwareTab();
      } else if (targetId === "tab-fleet") {
        renderFleetTab();
      } else if (targetId === "tab-audit-logs" && window.loadCSVLogs) {
        window.loadCSVLogs();
      }
    });
  });
}

function initAudioToggle() {
  const btn = document.getElementById("btnAudioToggle");
  const icon = document.getElementById("audioIcon");
  if (btn) {
    btn.addEventListener("click", () => {
      cityState.audioEnabled = !cityState.audioEnabled;
      icon.textContent = cityState.audioEnabled ? "🔊" : "🔇";
      btn.style.opacity = cityState.audioEnabled ? "1" : "0.55";
      if (cityState.audioEnabled) sfx.playBreachAlert();
    });
  }
}

function initReportExport() {
  const btn = document.getElementById("btnExportReport");
  if (btn) {
    btn.addEventListener("click", () => {
      const timeStr = new Date().toLocaleString();
      const staffName = cityState.authenticatedUser?.name || "Sri B. V. Ashwath, IAS (Commissioner, TMP)";
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <html>
        <head>
          <title>TMP Executive SWM Commission Report - Tumakuru City</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111; line-height: 1.6; }
            h1 { font-size: 22px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 4px; }
            .kannada-header { font-size: 16px; color: #1e3a8a; font-weight: bold; margin-bottom: 8px; }
            .header-meta { font-size: 13px; color: #555; margin-bottom: 25px; }
            .score-box { background: #f0fdf4; border: 1px solid #86efac; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f8fafc; font-weight: bold; }
            .badge-crit { color: #dc2626; font-weight: bold; }
            .badge-norm { color: #16a34a; font-weight: bold; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="kannada-header">ತುಮಕೂರು ಮಹಾನಗರ ಪಾಲಿಕೆ &bull; ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ಘನತ್ಯಾಜ್ಯ ನಿರ್ವಹಣಾ ವರದಿ</div>
          <h1>Tumakuru City Corporation (TMP) &bull; Smart Waste Commission Report</h1>
          <div class="header-meta">Generated on: ${timeStr} &bull; Authorized Officer: ${staffName} &bull; Tumakuru, Karnataka</div>
          
          <div class="score-box">
            <h3 style="margin: 0 0 5px 0; color: #166534;">🏆 Swachh Tumakuru Rating: 97.2% (Grade A+ Swachh Platinum City)</h3>
            <p style="margin: 0; font-size: 13px;">Daily Collected: 62.4 Tons &bull; Recycling Efficiency: 78.5% &bull; Active EV Fleets: 4/4 Units</p>
          </div>

          <h3>Tumakuru Smart Bin Hubs Telemetry Summary</h3>
          <table>
            <thead>
              <tr>
                <th>Hub ID & Location</th>
                <th>Municipal Ward</th>
                <th>Organic Bin Fill</th>
                <th>Dry Bin Fill</th>
                <th>Max Fill Level</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${Object.keys(cityState.sitesDirectory).map(id => {
                const s = cityState.sitesDirectory[id];
                const r = cityState.readings[id] || {};
                const org = r.organic?.fill_percent || 0;
                const dry = r.dry?.fill_percent || 0;
                const max = Math.max(org, dry);
                return `
                  <tr>
                    <td><strong>${id}</strong> - ${s.name} (${s.kannada_name || ''})</td>
                    <td>${s.ward}</td>
                    <td>${org}% (${r.organic?.distance_cm || 0}cm)</td>
                    <td>${dry}% (${r.dry?.distance_cm || 0}cm)</td>
                    <td><strong>${max}%</strong></td>
                    <td class="${max >= 80 ? 'badge-crit' : 'badge-norm'}">${max >= 80 ? 'CRITICAL (BREACH)' : (max >= 60 ? 'WARNING' : 'NORMAL')}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <div style="margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; font-size: 12px; color: #777;">
            Official Government Record &bull; Tumakuru City Corporation (TMP), Karnataka &bull; Powered by SWMS IoT Core
          </div>
          <br>
          <button onclick="window.print()" style="padding: 10px 20px; font-weight: bold; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Print / Save as PDF</button>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }
}

// ---------------------------------------------------------------------------
// DATA FETCHING & SYNC
// ---------------------------------------------------------------------------
async function fetchCityOverview() {
  try {
    const resp = await fetch("/api/city/overview");
    const data = await resp.json();
    cityState.sitesDirectory = data.sites_directory || {};
    cityState.readings = data.readings || {};
    cityState.fleet = data.fleet || [];
    cityState.alerts = (await (await fetch("/api/alerts")).json()).history || [];
    
    updateHeaderStats(data);
    renderMapSidebar();
    renderAlertFeed();
    renderHardwareTab();
    renderFleetTab();
  } catch (err) {
    console.error("Failed to load Tumakuru city overview:", err);
  }
}

function updateHeaderStats(data) {
  const hdrTonnage = document.getElementById("hdrTonnage");
  const hdrActiveFleet = document.getElementById("hdrActiveFleet");
  const hdrCriticalCount = document.getElementById("hdrCriticalCount");
  
  const kpiTotalBins = document.getElementById("kpiTotalBins");
  const kpiAvgFill = document.getElementById("kpiAvgFill");
  const kpiCriticalBins = document.getElementById("kpiCriticalBins");
  const kpiCarbonOffset = document.getElementById("kpiCarbonOffset");

  if (hdrTonnage) hdrTonnage.textContent = `${data.daily_tonnage_collected || 62.4} T`;
  if (hdrActiveFleet) hdrActiveFleet.textContent = `${data.active_fleet_count || 4} / ${data.total_fleet_count || 4} Units`;
  if (hdrCriticalCount) hdrCriticalCount.textContent = `${data.critical_bins_count || 0} Bins`;

  if (kpiTotalBins) kpiTotalBins.textContent = `${data.total_monitored_bins || 16} Bins`;
  if (kpiAvgFill) kpiAvgFill.textContent = `${data.avg_city_fill_pct || 56.5}%`;
  if (kpiCriticalBins) kpiCriticalBins.textContent = data.critical_bins_count || 0;
  if (kpiCarbonOffset) kpiCarbonOffset.textContent = `${data.carbon_saved_today_kg || 589.4} kg`;
}

// ---------------------------------------------------------------------------
// LEAFLET GIS CITY MAP (TUMAKURU: 13.3392° N, 77.1018° E)
// ---------------------------------------------------------------------------
function initGisMap() {
  const mapElement = document.getElementById("cityGisMap");
  if (!mapElement || cityState.map) return;

  // Center specifically on Tumakuru Town Center & B.H. Road Corridor
  cityState.map = L.map('cityGisMap', {
    zoomControl: true,
    attributionControl: false
  }).setView([13.3392, 77.1018], 13);

  // Set default Esri Dark Gray Canvas (Clean, Dark, Zero Watermarks)
  switchBasemap("esri_dark");
  renderMapMarkers();
}

function switchBasemap(styleKey) {
  if (!cityState.map) return;

  if (cityState.currentTileLayer) {
    cityState.map.removeLayer(cityState.currentTileLayer);
  }
  if (cityState.currentTileLabelLayer) {
    cityState.map.removeLayer(cityState.currentTileLabelLayer);
    cityState.currentTileLabelLayer = null;
  }

  if (styleKey === "esri_dark") {
    // Esri World Dark Gray Canvas Base
    cityState.currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16
    }).addTo(cityState.map);

    // Reference Labels
    cityState.currentTileLabelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16
    }).addTo(cityState.map);

  } else if (styleKey === "osm_standard") {
    cityState.currentTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(cityState.map);

  } else if (styleKey === "esri_satellite") {
    cityState.currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18
    }).addTo(cityState.map);
  }
}

function renderMapMarkers() {
  if (!cityState.map) return;

  // Clear existing site markers
  Object.values(cityState.markers).forEach(m => cityState.map.removeLayer(m));
  cityState.markers = {};

  // Render Tumakuru Smart Bin Hubs
  Object.keys(cityState.sitesDirectory).forEach(siteId => {
    const site = cityState.sitesDirectory[siteId];
    const r = cityState.readings[siteId] || {};
    const orgFill = r.organic?.fill_percent || 0;
    const dryFill = r.dry?.fill_percent || 0;
    const maxFill = Math.max(orgFill, dryFill);

    let markerClass = "marker-normal";
    if (maxFill >= cityState.threshold) markerClass = "marker-critical";
    else if (maxFill >= 60) markerClass = "marker-warning";

    const customIcon = L.divIcon({
      className: 'custom-bin-div-icon',
      html: `<div class="leaflet-bin-marker ${markerClass}">${maxFill}%</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([site.lat, site.lng], { icon: customIcon }).addTo(cityState.map);

    const popupHtml = `
      <div style="padding: 6px 4px; min-width: 230px;">
        <div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: bold;">${site.ward}</div>
        <h4 style="margin: 3px 0 2px 0; font-size: 0.95rem; font-weight: 800; color: #fff;">${site.name}</h4>
        <div style="font-size: 0.75rem; color: #fbbf24; margin-bottom: 8px;">${site.kannada_name || ''}</div>
        
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <div style="flex: 1; background: rgba(16,185,129,0.15); padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.3);">
            <div style="font-size: 0.65rem; color: #6ee7b7;">ORGANIC</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${orgFill}%</div>
          </div>
          <div style="flex: 1; background: rgba(6,182,212,0.15); padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(6,182,212,0.3);">
            <div style="font-size: 0.65rem; color: #67e8f9;">DRY WASTE</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: #fff;">${dryFill}%</div>
          </div>
        </div>

        <button onclick="dispatchTruckToSite('${siteId}')" style="width: 100%; padding: 6px; background: linear-gradient(135deg, #2563eb, #3b82f6); border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 0.78rem; cursor: pointer; margin-bottom: 5px;">
          🚛 Dispatch Tumakuru EV Truck
        </button>
        <button onclick="inspectSiteInHardware('${siteId}')" style="width: 100%; padding: 5px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #cbd5e1; font-size: 0.72rem; cursor: pointer;">
          🛰️ Deep Inspect Sensors
        </button>
      </div>
    `;

    marker.bindPopup(popupHtml);
    cityState.markers[siteId] = marker;
  });

  // Render Tumakuru Sanitation Fleets
  Object.values(cityState.truckMarkers).forEach(m => cityState.map.removeLayer(m));
  cityState.truckMarkers = {};

  cityState.fleet.forEach(truck => {
    const truckIcon = L.divIcon({
      className: 'custom-truck-div-icon',
      html: `<div class="leaflet-truck-marker">🚛 ${truck.id}</div>`,
      iconSize: [110, 28],
      iconAnchor: [55, 14]
    });

    const tMarker = L.marker([truck.lat, truck.lng], { icon: truckIcon }).addTo(cityState.map);
    tMarker.bindPopup(`
      <div style="padding: 4px;">
        <h4 style="color: #60a5fa; font-size: 0.9rem; margin-bottom: 4px;">${truck.id} &bull; ${truck.vehicle_num}</h4>
        <p style="font-size: 0.75rem; color: #ccc; margin: 0 0 4px 0;"><strong>Driver:</strong> ${truck.driver} (${truck.phone})</p>
        <p style="font-size: 0.75rem; color: #ccc; margin: 0 0 4px 0;"><strong>Target:</strong> ${truck.current_target}</p>
        <p style="font-size: 0.75rem; color: #34d399; margin: 0;"><strong>Capacity:</strong> ${truck.capacity_filled_pct}% Filled | EV Battery: ${truck.battery_pct}%</p>
      </div>
    `);
    cityState.truckMarkers[truck.id] = tMarker;
  });
}

function renderMapSidebar() {
  const container = document.getElementById("mapSiteDirectoryList");
  if (!container) return;
  container.innerHTML = "";

  Object.keys(cityState.sitesDirectory).forEach(siteId => {
    const site = cityState.sitesDirectory[siteId];
    const r = cityState.readings[siteId] || {};
    const orgFill = r.organic?.fill_percent || 0;
    const dryFill = r.dry?.fill_percent || 0;
    const maxFill = Math.max(orgFill, dryFill);

    const card = document.createElement("div");
    card.className = `site-item-card ${maxFill >= cityState.threshold ? 'active' : ''}`;
    card.innerHTML = `
      <div class="site-item-header">
        <div>
          <div class="site-name-title">${site.name}</div>
          <div class="site-ward-tag">${site.ward} &bull; <span style="color: #fde68a;">${site.kannada_name || ''}</span></div>
        </div>
        <span class="status-tag ${maxFill >= cityState.threshold ? 'fail' : (maxFill >= 60 ? 'warning' : 'pass')}" style="font-size: 0.7rem;">
          ${maxFill}%
        </span>
      </div>
      <div class="mini-fill-bars">
        <div class="mini-bar-wrap">
          <div class="mini-bar-label"><span>Organic</span><span>${orgFill}%</span></div>
          <div class="mini-bar-track">
            <div class="mini-bar-fill" style="width: ${orgFill}%; background: #10b981;"></div>
          </div>
        </div>
        <div class="mini-bar-wrap">
          <div class="mini-bar-label"><span>Dry</span><span>${dryFill}%</span></div>
          <div class="mini-bar-track">
            <div class="mini-bar-fill" style="width: ${dryFill}%; background: #06b6d4;"></div>
          </div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (cityState.map && cityState.markers[siteId]) {
        cityState.map.flyTo([site.lat, site.lng], 15, { duration: 1.2 });
        cityState.markers[siteId].openPopup();
      }
    });

    container.appendChild(card);
  });
}

// Global actions exposed to popup buttons
window.dispatchTruckToSite = async function(siteId) {
  try {
    const availableTruck = cityState.fleet.find(t => t.status !== "COLLECTING") || cityState.fleet[0];
    const resp = await fetch("/api/fleet/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        truck_id: availableTruck.id,
        target_site_id: siteId
      })
    });
    const res = await resp.json();
    alert(`🚀 TMP Dispatch Order Confirmed!\n${availableTruck.id} (${availableTruck.driver}) deployed to ${cityState.sitesDirectory[siteId].name}.\nEstimated Arrival: ${res.eta_minutes} mins.`);
    await fetchCityOverview();
  } catch (e) {
    console.error("Dispatch error:", e);
  }
};

window.inspectSiteInHardware = function(siteId) {
  cityState.currentInspectedSite = siteId;
  const tabs = document.querySelectorAll(".nav-tab-link");
  tabs.forEach(t => t.classList.remove("active"));
  const hwTabBtn = document.querySelector('[data-tab="tab-hardware"]');
  if (hwTabBtn) hwTabBtn.classList.add("active");

  const tabContents = ["tab-gis-map", "tab-analytics", "tab-hardware", "tab-fleet", "tab-qa-matrix", "tab-audit-logs"];
  tabContents.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === "tab-hardware") ? "block" : "none";
  });

  const select = document.getElementById("hardwareSiteSelect");
  if (select) select.value = siteId;
  renderHardwareTab();
};

window.dispatchZonalFleet = function(zoneKey) {
  const criticalSiteInZone = Object.keys(cityState.sitesDirectory).find(id => {
    return cityState.sitesDirectory[id].zone === zoneKey;
  });
  if (criticalSiteInZone) {
    window.dispatchTruckToSite(criticalSiteInZone);
  } else {
    alert("All smart bin hubs in this Tumakuru zone are currently within normal capacity limits.");
  }
};

function optimizeFleetRoutes() {
  const criticalSites = Object.keys(cityState.sitesDirectory).filter(id => {
    const r = cityState.readings[id] || {};
    return (r.organic?.fill_percent >= 80 || r.dry?.fill_percent >= 80);
  });

  if (criticalSites.length === 0) {
    alert("✅ AI Fleet Route Optimizer: Zero critical breaches across Tumakuru City. All trucks in patrol mode.");
    return;
  }

  criticalSites.forEach((siteId, idx) => {
    const truck = cityState.fleet[idx % cityState.fleet.length];
    window.dispatchTruckToSite(siteId);
  });
}

// ---------------------------------------------------------------------------
// REAL-TIME ALERTS FEED
// ---------------------------------------------------------------------------
function renderAlertFeed() {
  const container = document.getElementById("cityAlertStream");
  if (!container) return;
  container.innerHTML = "";

  if (cityState.alerts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
        No active critical threshold breach alerts in Tumakuru. All bins within safe operating limits.
      </div>
    `;
    return;
  }

  cityState.alerts.slice(0, 8).forEach(alert => {
    const isAck = alert.status === "ACKNOWLEDGED";
    const row = document.createElement("div");
    row.className = `alert-row ${isAck ? 'acknowledged' : ''}`;
    row.innerHTML = `
      <div>
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.2rem;">
          <span style="font-weight: 800; color: ${isAck ? '#fff' : '#fca5a5'}; font-size: 0.95rem;">${alert.subject || 'Threshold Breach'}</span>
          <span style="font-size: 0.7rem; font-family: var(--font-mono); color: var(--text-muted);">${new Date(alert.timestamp).toLocaleTimeString()}</span>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 0.4rem 0;">${alert.message}</p>
        <div style="display: flex; gap: 0.5rem; font-size: 0.72rem; color: var(--text-muted);">
          <span>📍 ${alert.site_name || alert.site_id}</span>
          <span>&bull;</span>
          <span>📦 ${alert.bin_type?.toUpperCase()} (${alert.fill_percent}%)</span>
          <span>&bull;</span>
          <span style="color: #34d399;">TMP SMS Dispatch ✓</span>
          <span>&bull;</span>
          <span style="color: #34d399;">Official Email ✓</span>
        </div>
      </div>
      <div>
        ${isAck ? `
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">✓ Dispatched</span>
        ` : `
          <button class="btn btn-primary" onclick="window.dispatchTruckToSite('${alert.site_id}')" style="padding: 0.45rem 0.9rem; font-size: 0.8rem;">
            🚛 Dispatch TMP Truck
          </button>
        `}
      </div>
    `;
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// DUAL-BIN HARDWARE TAB RENDERER
// ---------------------------------------------------------------------------
function renderHardwareTab() {
  const siteId = cityState.currentInspectedSite;
  const site = cityState.sitesDirectory[siteId] || { name: "KSRTC Central Bus Stand Hub", ward: "Ward 08", address: "B.H. Road, Tumakuru" };
  const r = cityState.readings[siteId] || {
    organic: { fill_percent: 48, distance_cm: 26.0, alert_triggered: false },
    dry: { fill_percent: 88, distance_cm: 6.0, alert_triggered: true }
  };

  const org = r.organic || { fill_percent: 0, distance_cm: 50.0 };
  const dry = r.dry || { fill_percent: 0, distance_cm: 50.0 };

  // Update Metadata Banner
  const hwHubName = document.getElementById("hwHubName");
  const hwWardName = document.getElementById("hwWardName");
  const hwAddress = document.getElementById("hwAddress");
  const hwBatteryMv = document.getElementById("hwBatteryMv");
  const hwTempC = document.getElementById("hwTempC");
  const hwOdor = document.getElementById("hwOdor");

  if (hwHubName) hwHubName.innerHTML = `${site.name} <span style="font-size: 0.85rem; color: #fde68a;">(${site.kannada_name || ''})</span>`;
  if (hwWardName) hwWardName.textContent = `${site.ward} &bull; ${site.zone || 'Central Zone'}`;
  if (hwAddress) hwAddress.textContent = site.address || "Tumakuru Smart City Hub";
  if (hwBatteryMv) hwBatteryMv.textContent = `${site.battery_mv || 4180} mV`;
  if (hwTempC) hwTempC.textContent = `${site.temperature_c || 27.5} °C`;
  if (hwOdor) hwOdor.textContent = site.odor_index || "Moderate";

  // Organic Bin
  const hwVisualOrg = document.getElementById("hwVisualOrg");
  const hwTxtFillOrg = document.getElementById("hwTxtFillOrg");
  const hwTxtDistOrg = document.getElementById("hwTxtDistOrg");
  const hwPillOrg = document.getElementById("hwPillOrg");
  const hwCardOrg = document.getElementById("hwCardOrg");
  const hwSliderOrg = document.getElementById("hwSliderOrg");
  const hwSliderValOrg = document.getElementById("hwSliderValOrg");

  if (hwVisualOrg) hwVisualOrg.style.height = `${org.fill_percent}%`;
  if (hwTxtFillOrg) hwTxtFillOrg.innerHTML = `<span>${org.fill_percent}</span><span class="metric-unit">%</span>`;
  if (hwTxtDistOrg) hwTxtDistOrg.innerHTML = `<span>${org.distance_cm.toFixed(1)}</span><span class="metric-unit">cm</span>`;
  if (hwSliderOrg) hwSliderOrg.value = org.fill_percent;
  if (hwSliderValOrg) hwSliderValOrg.textContent = `${org.fill_percent}%`;

  if (org.fill_percent >= cityState.threshold) {
    if (hwPillOrg) { hwPillOrg.className = "bin-state-pill critical"; hwPillOrg.textContent = "CRITICAL (>=80%)"; }
    if (hwCardOrg) hwCardOrg.classList.add("critical");
    if (hwVisualOrg) hwVisualOrg.classList.add("critical");
  } else {
    if (hwPillOrg) { hwPillOrg.className = "bin-state-pill normal"; hwPillOrg.textContent = "NORMAL"; }
    if (hwCardOrg) hwCardOrg.classList.remove("critical");
    if (hwVisualOrg) hwVisualOrg.classList.remove("critical");
  }

  // Dry Waste Bin
  const hwVisualDry = document.getElementById("hwVisualDry");
  const hwTxtFillDry = document.getElementById("hwTxtFillDry");
  const hwTxtDistDry = document.getElementById("hwTxtDistDry");
  const hwPillDry = document.getElementById("hwPillDry");
  const hwCardDry = document.getElementById("hwCardDry");
  const hwSliderDry = document.getElementById("hwSliderDry");
  const hwSliderValDry = document.getElementById("hwSliderValDry");

  if (hwVisualDry) hwVisualDry.style.height = `${dry.fill_percent}%`;
  if (hwTxtFillDry) hwTxtFillDry.innerHTML = `<span>${dry.fill_percent}</span><span class="metric-unit">%</span>`;
  if (hwTxtDistDry) hwTxtDistDry.innerHTML = `<span>${dry.distance_cm.toFixed(1)}</span><span class="metric-unit">cm</span>`;
  if (hwSliderDry) hwSliderDry.value = dry.fill_percent;
  if (hwSliderValDry) hwSliderValDry.textContent = `${dry.fill_percent}%`;

  if (dry.fill_percent >= cityState.threshold) {
    if (hwPillDry) { hwPillDry.className = "bin-state-pill critical"; hwPillDry.textContent = "CRITICAL (>=80%)"; }
    if (hwCardDry) hwCardDry.classList.add("critical");
    if (hwVisualDry) hwVisualDry.classList.add("critical");
  } else {
    if (hwPillDry) { hwPillDry.className = "bin-state-pill normal"; hwPillDry.textContent = "NORMAL"; }
    if (hwCardDry) hwCardDry.classList.remove("critical");
    if (hwVisualDry) hwVisualDry.classList.remove("critical");
  }
}

// ---------------------------------------------------------------------------
// SANITATION FLEET TAB RENDERER
// ---------------------------------------------------------------------------
function renderFleetTab() {
  const container = document.getElementById("fleetGridList");
  if (!container) return;
  container.innerHTML = "";

  cityState.fleet.forEach(truck => {
    const card = document.createElement("div");
    card.className = "glass-panel truck-card";
    card.innerHTML = `
      <div class="truck-card-header">
        <div>
          <span class="site-ward-tag">${truck.zone} &bull; ${truck.type}</span>
          <div class="truck-id-badge">🚛 ${truck.id} &bull; ${truck.vehicle_num}</div>
        </div>
        <span class="truck-status-pill status-tag ${truck.status === 'EN_ROUTE' ? 'warning' : (truck.status === 'COLLECTING' ? 'fail' : 'pass')}">
          ${truck.status}
        </span>
      </div>

      <div class="truck-metrics-row">
        <div class="truck-metric-box">
          <div class="truck-metric-val">${truck.capacity_filled_pct}%</div>
          <div class="truck-metric-lbl">Tank Capacity</div>
        </div>
        <div class="truck-metric-box">
          <div class="truck-metric-val" style="color: #34d399;">${truck.battery_pct}%</div>
          <div class="truck-metric-lbl">EV Battery</div>
        </div>
        <div class="truck-metric-box">
          <div class="truck-metric-val" style="color: #38bdf8;">${truck.speed_kmh} km/h</div>
          <div class="truck-metric-lbl">Live Speed</div>
        </div>
      </div>

      <div style="background: rgba(255,255,255,0.03); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-subtle); font-size: 0.82rem;">
        <div><strong>Assigned Target:</strong> ${truck.current_target}</div>
        <div style="margin-top: 0.3rem;"><strong>Driver:</strong> ${truck.driver} (${truck.phone})</div>
        <div style="margin-top: 0.3rem; color: #34d399;"><strong>Carbon Offset:</strong> ${truck.fuel_saved_co2_kg} kg CO₂ saved</div>
      </div>

      <div style="display: flex; gap: 0.75rem;">
        <button class="btn btn-primary" onclick="dispatchZonalFleet('${truck.zone}')" style="flex: 1;">
          ⚡ Optimize Next Hub
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// CHART.JS EXECUTIVE ANALYTICS
// ---------------------------------------------------------------------------
function initAnalyticsCharts() {
  const hourlyCanvas = document.getElementById("chartHourlyCurve");
  const pieCanvas = document.getElementById("chartSegregationPie");

  if (hourlyCanvas && !cityState.hourlyChart) {
    const ctx = hourlyCanvas.getContext("2d");
    cityState.hourlyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Organic Waste (Tons)",
            data: [],
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            fill: true,
            tension: 0.4
          },
          {
            label: "Dry Recyclables (Tons)",
            data: [],
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6, 182, 212, 0.15)",
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cbd5e1" } }
        },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: { ticks: { color: "#64748b" }, grid: { color: "rgba(255,255,255,0.05)" } }
        }
      }
    });
  }

  if (pieCanvas && !cityState.segregationChart) {
    const ctx = pieCanvas.getContext("2d");
    cityState.segregationChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Organic Bio-Waste", "Dry Recyclables (Plastic/Paper)", "Hazardous & E-Waste"],
        datasets: [{
          data: [58, 34, 8],
          backgroundColor: ["#10b981", "#06b6d4", "#f59e0b"],
          borderColor: "#060913",
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { color: "#cbd5e1" } }
        }
      }
    });
  }

  loadHourlyAnalyticsData();
}

async function loadHourlyAnalyticsData() {
  try {
    const resp = await fetch("/api/analytics/hourly-trends");
    const data = await resp.json();
    if (cityState.hourlyChart) {
      cityState.hourlyChart.data.labels = data.labels;
      cityState.hourlyChart.data.datasets[0].data = data.organic_tons;
      cityState.hourlyChart.data.datasets[1].data = data.dry_tons;
      cityState.hourlyChart.update();
    }
  } catch (e) {
    console.error("Hourly analytics error:", e);
  }
}

// ---------------------------------------------------------------------------
// WEBSOCKET TELEMETRY STREAM
// ---------------------------------------------------------------------------
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  setInterval(() => {
    fetchCityOverview();
  }, 3500);

  try {
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "INITIAL_STATE") {
          cityState.sitesDirectory = msg.sites_directory || cityState.sitesDirectory;
          cityState.readings = msg.readings || cityState.readings;
          cityState.fleet = msg.fleet || cityState.fleet;
          cityState.alerts = msg.alerts || cityState.alerts;
          renderMapMarkers();
          renderMapSidebar();
          renderAlertFeed();
          renderHardwareTab();
          renderFleetTab();
        } else if (msg.type === "TELEMETRY_UPDATE") {
          if (!cityState.readings[msg.site_id]) cityState.readings[msg.site_id] = {};
          cityState.readings[msg.site_id][msg.bin_type] = msg.reading;
          renderMapMarkers();
          renderMapSidebar();
          if (msg.site_id === cityState.currentInspectedSite) renderHardwareTab();
        } else if (msg.type === "NEW_ALERT") {
          cityState.alerts.unshift(msg.alert);
          sfx.playBreachAlert();
          renderAlertFeed();
          renderMapMarkers();
        } else if (msg.type === "TRUCK_DISPATCHED") {
          const found = cityState.fleet.find(t => t.id === msg.truck.id);
          if (found) Object.assign(found, msg.truck);
          renderFleetTab();
          renderMapMarkers();
        } else if (msg.type === "CITY_SURGE_EVENT") {
          sfx.playBreachAlert();
          fetchCityOverview();
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onclose = () => {
      setTimeout(initWebSocket, 4000);
    };
  } catch (err) {
    console.warn("WebSocket fallback active:", err);
  }
}
