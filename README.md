# Tumakuru City Corporation (TMP - ತುಮಕೂರು ಮಹಾನಗರ ಪಾಲಿಕೆ)
## Smart Waste Management System (SWMS-2026-P1) — Operations Command Center

[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-Render-10b981?style=for-the-badge&logo=render&logoColor=white)](https://public-waste-management-system.onrender.com/)
[![Status](https://img.shields.io/badge/Status-Live%20%26%20Deployed-brightgreen?style=for-the-badge)](https://public-waste-management-system.onrender.com/)
[![City](https://img.shields.io/badge/City-Tumakuru%2C%20Karnataka%2C%20India-blue?style=for-the-badge)](https://public-waste-management-system.onrender.com/)

> ### 🌐 Live Application URL
> **[https://public-waste-management-system.onrender.com/](https://public-waste-management-system.onrender.com/)**
>
> ತುಮಕೂರು ಮಹಾನಗರ ಪಾಲಿಕೆ • Tumakuru City Corporation — Smart Waste Command Center

An enterprise-grade, paid-tier Smart Waste Management Command Center and IoT Telemetry Platform purpose-built for the **Tumakuru City Corporation, Municipal Commissioner, Zonal Environmental Engineers, and Sanitation Logistics Fleet**.

---


## 🏛️ System Architecture Overview

```
[ Dual HC-SR04 Sensors + ESP32 Nodes (SITE_TUM_001..008) ]
                           │ (HTTP PUT / WiFi / 4G)
                           ▼
  [ FastAPI + Uvicorn Real-Time Gateway (Port 8000) ]
        ├── Municipal Staff Auth & Role-Based Access (JWT)
        ├── Firebase RTDB Compatibility Router (/readings/{site_id}/{bin_type}.json)
        ├── Dynamic Diurnal Analytics & Waste Segregation Aggregator
        ├── WebSocket Live Broadcast Engine (/ws)
        └── AI Route Optimization Engine (Haversine Traveling Fleet)
                           │
        ├── [ Alert Engine Microservice ] ──> CSV Audit Log & SMS/Email Dispatch
        │
        └── [ Operations Command Center UI ]
              ├── Esri World Canvas GIS Map (Tumakuru Geo-Grid)
              ├── Live Fleet Tracking (KA-06 EV Compactor Trucks)
              ├── 3D Fluid Tank Visualizers & Sensor Sliders
              ├── Bilingual Kannada/English UI & Audio Chimes
              └── Automated 10-Point QA Acceptance Test Runner
```

---

## 📍 Tumakuru City Smart Hub Deployment Grid

| Hub ID | Location / Landmark | Tumakuru Zone | Ward No. | Coordinates |
|---|---|---|---|---|
| `SITE_TUM_001` | **Central KSRTC Bus Stand** | Zone 1 (Central) | Ward 12 | `13.3409° N, 77.1010° E` |
| `SITE_TUM_002` | **Mandipet Commercial Market** | Zone 1 (Central) | Ward 14 | `13.3365° N, 77.0982° E` |
| `SITE_TUM_003` | **Town Hall & MG Road Promenade** | Zone 1 (Central) | Ward 18 | `13.3421° N, 77.1065° E` |
| `SITE_TUM_004` | **Sri Siddaganga Mutt Hub** | Zone 2 (Siddharoodha) | Ward 32 | `13.3288° N, 77.1350° E` |
| `SITE_TUM_005` | **SIT College & Tech Campus** | Zone 3 (Batawadi / SIT) | Ward 24 | `13.3269° N, 77.1261° E` |
| `SITE_TUM_006` | **Tumakuru Railway Station Plaza** | Zone 1 (Central) | Ward 08 | `13.3462° N, 77.0955° E` |
| `SITE_TUM_007` | **Amanikere Lake Eco-Park** | Zone 4 (Kyathsandra / Belagumba) | Ward 29 | `13.3490° N, 77.1140° E` |
| `SITE_TUM_008` | **Vasanthanarasapura Industrial Park** | Zone 4 (Industrial Mega Hub) | Ward 35 | `13.3150° N, 77.0750° E` |

---

## 🔐 Municipal Staff Login Credentials

The system implements secure Role-Based Access Control (RBAC) with pre-configured Tumakuru Municipal Corporation accounts:

| Role | Name | User ID / Login | Password | Scope / Permissions |
|---|---|---|---|---|
| **Municipal Commissioner** | Dr. B. R. Patil, IAS | `commissioner.tumkur` | `tumkur@swms2026` | Full City-Wide Override, Audit Logs & Route Approval |
| **Zonal Officer (Central)** | S. Venkatesh (EE) | `officer.central` | `central@tumkur2026` | Zone 1 (Wards 01–15), Sensor Calibration & Fleet Control |
| **Zonal Officer (Siddaganga)** | Manjunath Swamy (AEE)| `officer.siddaganga` | `mutt@tumkur2026` | Zone 2 (Wards 16–28), Religious & Heritage Zone Logs |
| **Zonal Officer (SIT & Tech)** | Prof. K. Ramesh (AE) | `officer.sit` | `sit@tumkur2026` | Zone 3 (Wards 29–35), University & Smart Sensor Labs |
| **Chief Field Inspector** | N. Somanna (SI) | `inspector.tumkur` | `staff@tumkur2026` | Field Emptying Confirmation & Physical Tagging |

*Tip: Quick 1-click login chips are available directly on the login screen for instant testing.*

---

## 🚀 Ready for Production Deployment

### Option A: 1-Click Launch (Windows)
Double-click `deploy.bat` or run:
```bat
deploy.bat
```

### Option B: Docker Compose (Any Platform / Cloud)
```bash
docker-compose up -d --build
```
Access the dashboard at **`http://localhost:8000`**.

### Option C: Native Python (Linux / macOS / Windows)
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run Alert Engine Unit Tests
pytest alert_engine/tests/test_alert_engine.py

# 3. Launch the Server
python run_system.py --host 0.0.0.0 --port 8000
```

### Option D: Enterprise systemd Service (Ubuntu/Debian Server)
```bash
sudo cp docs/tumakuru-swms.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tumakuru-swms
sudo systemctl status tumakuru-swms
```

---

## ⚡ ESP32 Hardware Wiring Guide

Each Tumakuru Smart Bin Hub operates a dual-ultrasonic sensor node (Organic Waste + Dry Recyclables):

| Sensor | HC-SR04 Pin | ESP32 GPIO | Description |
|---|---|---|---|
| **Organic Waste Bin** | VCC / GND | 5V / GND | Power & Common Ground |
| | TRIG | **GPIO 5** | 10µs ultrasonic trigger pulse |
| | ECHO | **GPIO 18** | Echo width measurement |
| **Dry Recyclable Bin** | VCC / GND | 5V / GND | Power & Common Ground |
| | TRIG | **GPIO 19** | 10µs ultrasonic trigger pulse |
| | ECHO | **GPIO 21** | Echo width measurement |
| **Status LED** | Anode | **GPIO 2** | WiFi / Cloud connection heartbeat |

**Flashing Instructions**:
1. Open `firmware/SWMS_P1_firmware.ino` in Arduino IDE.
2. Select Board: **ESP32 Dev Module**.
3. Set your WiFi credentials (`WIFI_SSID`, `WIFI_PASSWORD`).
4. Set `FIREBASE_HOST` to your server IP (e.g. `http://192.168.1.100:8000`).
5. Select the appropriate `SITE_ID` (e.g. `SITE_TUM_001` for Bus Stand) and click **Upload**.

---

## 🧪 Automated QA Acceptance Test Suite

The system includes an automated test runner for all 10 QA criteria outlined in the technical specification:

1. **TC-01**: Sensor Accuracy across 5cm to 50cm.
2. **TC-02**: Threshold Alert Trigger at $\ge 80\%$.
3. **TC-03**: State-Machine Alert De-duplication.
4. **TC-04**: Firebase RTDB Schema Compatibility.
5. **TC-05**: Webhook & SMS Multi-Channel Notification.
6. **TC-06**: CSV Audit Trail Append Verification.
7. **TC-07**: 30-Second Deep Sleep Power Cycle.
8. **TC-08**: 5-Sample Ultrasonic Noise Debounce Filtering.
9. **TC-09**: Dual-Bin Independent Telemetry Channels.
10. **TC-10**: End-to-End Latency Verification ($< 3000\text{ms}$).

Run QA tests via:
- **Interactive UI**: Navigate to the **"Automated QA Suite"** tab in the web command center.
- **REST API**: `POST http://127.0.0.1:8000/api/qa/run-tests`
- **Unit Test Runner**: `pytest alert_engine/tests/test_alert_engine.py`

---

## 📊 Core API Endpoints

- `GET /api/city/overview` - Complete snapshot of all 8 Tumakuru hubs, fill metrics, fleet positions, and compliance ratings.
- `GET /api/hubs` - Detailed list of Tumakuru smart bins with sensor distances and battery levels.
- `PUT /readings/{site_id}/{bin_type}.json` - ESP32 firmware telemetry ingest (Firebase RTDB protocol).
- `POST /api/alerts/simulate-fill` - Real-time fill level injector with alert trigger simulation.
- `POST /api/auth/login` - Staff authentication endpoint with role metadata.
- `POST /api/fleet/dispatch` - AI fleet routing and nearest truck dispatching.
- `GET /api/qa/audit-log` - Real-time CSV audit log streaming.

---

## 📄 Compliance & License
Developed for Tumakuru City Corporation (TMP) Smart City Mission under SWMS-2026-P1 Specification.
