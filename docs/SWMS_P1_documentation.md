# Smart Waste Management System — Phase 1 (SWMS-2026-P1)
### Bin Fill-Level Monitoring & Alert Module — Prototype Build Documentation

**Client:** Municipal Waste Corporation (Pilot Site)  
**Scope:** Single-site, dual-bin (Organic + Dry) monitoring unit, WiFi-connected, cloud-synced, real-time alerting.  
**Phase:** 1 — Prototype

---

## 1. System Architecture Overview

The system continuously measures the fill level of two waste bins (organic and dry) at a single site using ultrasonic distance sensors. An ESP32 microcontroller reads both sensors, computes fill percentage, and pushes readings to a cloud database. A separate alert engine monitors the cloud data and notifies the municipal corporation when a bin crosses a configured fill threshold.

**Data flow:**

```
[HC-SR04 Sensor: Organic] --\
                              >--> [ESP32 MCU] --(WiFi/HTTPS)--> [Firebase Realtime DB / REST API]
[HC-SR04 Sensor: Dry]      --/                                          |
                                                                          v
                                                          [Python Alert Engine (polling/events)]
                                                                          |
                                                          +---------------+---------------+
                                                          |                               |
                                                    [Twilio SMS]                   [SMTP Email]
                                                                          |
                                                                [Dashboard / Web View]
```

**Component list:**

| Component | Role |
|---|---|
| ESP32 Dev Board | Central MCU — sensor reading, WiFi, cloud upload, sleep management |
| HC-SR04 x2 | Distance sensing for organic and dry bins |
| Firebase Realtime DB | Cloud data store for live bin readings |
| Python Alert Engine | Polls DB, applies threshold logic, dispatches alerts |
| Twilio (optional) | SMS notification channel |
| SMTP (Gmail) | Free email notification channel |
| Power source | USB/power bank in prototype; solar + battery at scale |

---

## 2. Hardware Wiring Specification

**Pin mapping — ESP32 ↔ HC-SR04 (Organic bin):**

| HC-SR04 Pin | ESP32 GPIO |
|---|---|
| VCC | 5V |
| GND | GND |
| TRIG | GPIO 5 |
| ECHO | GPIO 18 |

**Pin mapping — ESP32 ↔ HC-SR04 (Dry bin):**

| HC-SR04 Pin | ESP32 GPIO |
|---|---|
| VCC | 5V |
| GND | GND |
| TRIG | GPIO 19 |
| ECHO | GPIO 21 |

---

## 3. Firmware Summary

See `firmware/SWMS_P1_firmware.ino` for the complete, ready-to-flash code.

**Key design points:**
- `readSensor()` — single ultrasonic pulse/echo measurement.
- `getAveragedDistance()` — 5-sample averaging, discarding failed reads, to reduce noise (debounce).
- `calculateFillPercent()` — converts distance to 0–100% fill using configured bin height.
- `sendToCloud()` — builds JSON payload and PUTs it to Firebase per bin.
- Deep sleep between cycles (30s in testing config; change `SLEEP_INTERVAL_SEC` to 900 for 15-minute production cycles).

---

## 4. Cloud Database Setup (Firebase)

JSON schema (matches firmware payload):

```json
{
  "readings": {
    "SITE_001": {
      "organic": {
        "site_id": "SITE_001",
        "bin_type": "organic",
        "fill_percent": 42,
        "timestamp": 1732789200,
        "alert_triggered": false,
        "device_status": "online"
      },
      "dry": {
        "site_id": "SITE_001",
        "bin_type": "dry",
        "fill_percent": 85,
        "timestamp": 1732789200,
        "alert_triggered": true,
        "device_status": "online"
      }
    }
  }
}
```

---

## 5. Alert Engine Summary

See `alert_engine/alert_engine.py` for the complete microservice code.

**Key design points:**
- `BinStateMachine` — tracks per-bin state (`NORMAL` → `ALERT_SENT` → reset on empty) so the same full bin doesn't trigger repeated alerts every poll cycle.
- `AlertDispatcher` — sends SMS via Twilio (optional) and/or email via SMTP, plus console and webhook notifications.
- All alerts are logged to `alert_log.csv` with timestamp, site, bin type, fill %, and action taken.

---

## 6. Validation & QA Checklist (10 Items)

| # | Test | Method | Pass Criteria |
|---|---|---|---|
| 1 | Sensor accuracy | Measure known distance with ruler, compare to Serial output | Within ±2cm |
| 2 | Fill % calculation | Place object at known height, verify calculated % | Matches expected % ±5% |
| 3 | WiFi connectivity | Power on device, check Serial log | Connects within 10s, prints IP |
| 4 | Cloud sync | Check Firebase console after upload | Reading appears within 5s of upload |
| 5 | Alert trigger (organic) | Manually raise organic fill above threshold | SMS/email received within 1 poll cycle |
| 6 | Alert trigger (dry) | Manually raise dry fill above threshold | SMS/email received within 1 poll cycle |
| 7 | De-duplication | Keep bin full across multiple poll cycles | Only ONE alert sent until bin emptied |
| 8 | Reset behavior | Empty bin after alert, refill later | New alert fires on next threshold breach |
| 9 | False positive rate | Run system for 2 hours idle | Zero spurious alerts |
| 10 | CSV logging | Check `alert_log.csv` after test alerts | All alerts logged with correct fields |
