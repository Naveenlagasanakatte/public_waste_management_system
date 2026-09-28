/*
  ============================================================================
  Project      : Smart Waste Management System (SWMS-2026-P1)
  Module       : Bin Fill-Level Sensing & Cloud Reporting Firmware
  Target MCU   : ESP32 Dev Board (NodeMCU / WROOM-32)
  Sensors      : 2x HC-SR04 Ultrasonic Distance Sensors
                 (Sensor A = Organic Waste Bin, Sensor B = Dry Waste Bin)
  Cloud Target : Firebase Realtime Database (REST API over HTTPS) or Local Gateway
  Author       : SWMS Engineering Team (Phase 1 Prototype)
  ============================================================================

  FUNCTIONAL OVERVIEW:
  1. Reads distance from two ultrasonic sensors (organic + dry bins).
  2. Converts distance -> fill percentage using configured bin height.
  3. Applies 5-sample averaging to reduce sensor noise (debounce).
  4. Compares fill percentage against FILL_THRESHOLD.
  5. Builds a JSON payload per bin and PUTs/POSTs it to Firebase via HTTPS.
  6. Enters deep sleep for SLEEP_INTERVAL seconds to conserve power, then repeats.
  ============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>

// ---------------------------------------------------------------------------
// CONFIGURATION BLOCK — Adjust per site before flashing
// ---------------------------------------------------------------------------
const char* WIFI_SSID        = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD    = "YOUR_WIFI_PASSWORD";

// Firebase Realtime Database REST endpoint (or Local SWMS Gateway URL)
// Examples:
// - Firebase: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com"
// - Local Server: "http://192.168.1.100:8000"
const char* FIREBASE_HOST    = "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com";
const char* FIREBASE_AUTH    = "";   // Leave blank for test mode / local server

// Tumakuru City Corporation (TMP) Hub Deployment IDs:
// SITE_TUM_001: Central Bus Stand Hub (Zone 1)
// SITE_TUM_002: Mandipet Commercial Market (Zone 1)
// SITE_TUM_003: Town Hall & MG Road (Zone 1)
// SITE_TUM_004: Sri Siddaganga Mutt Hub (Zone 2)
// SITE_TUM_005: SIT College Campus & Tech Park (Zone 3)
// SITE_TUM_006: Tumakuru Railway Station Plaza (Zone 1)
// SITE_TUM_007: Amanikere Lake Eco-Park Promenade (Zone 4)
// SITE_TUM_008: Vasanthanarasapura Industrial Mega Park (Zone 4)
const char* SITE_ID          = "SITE_TUM_001";
const float BIN_HEIGHT_CM    = 50.0;   // Empty-bin distance (sensor face to bin floor)
const int   FILL_THRESHOLD   = 80;     // Percent, triggers alert flag (>= 80%)
const int   SAMPLE_COUNT     = 5;      // Readings averaged per cycle to filter noise
const uint64_t SLEEP_INTERVAL_SEC = 30; // Testing: 30s | Production: 900s (15 min)

// ---------------------------------------------------------------------------
// GPIO PIN MAPPINGS (ESP32 DevKit v1)
// ---------------------------------------------------------------------------
// HC-SR04 Sensor 1: Organic Bin
const int TRIG_ORGANIC = 5;
const int ECHO_ORGANIC = 18;

// HC-SR04 Sensor 2: Dry Waste Bin
const int TRIG_DRY     = 19;
const int ECHO_DRY     = 21;

// Status LED (Optional: Built-in LED on GPIO 2)
const int STATUS_LED   = 2;

// ---------------------------------------------------------------------------
// STRUCT: Holds single bin telemetry
// ---------------------------------------------------------------------------
struct BinReading {
  const char* binType;
  float distanceCm;
  int fillPercent;
  bool alertTriggered;
};

// ---------------------------------------------------------------------------
// FUNCTION: readSensor()
// Triggers HC-SR04 ultrasonic pulse and returns raw measured distance in cm.
// ---------------------------------------------------------------------------
float readSensor(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // 30,000 microseconds timeout = ~5.1 meters max range
  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) {
    return -1.0; // Echo timeout or sensor disconnected
  }
  
  // Speed of sound = 343 m/s = 0.0343 cm/us (divided by 2 for round-trip)
  float distanceCm = (float)duration * 0.0343f / 2.0f;
  return distanceCm;
}

// ---------------------------------------------------------------------------
// FUNCTION: getAveragedDistance()
// Collects SAMPLE_COUNT readings, discards outliers/failures, and averages.
// ---------------------------------------------------------------------------
float getAveragedDistance(int trigPin, int echoPin) {
  float sum = 0.0f;
  int validSamples = 0;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    float d = readSensor(trigPin, echoPin);
    if (d > 1.0f && d <= (BIN_HEIGHT_CM + 20.0f)) {
      sum += d;
      validSamples++;
    }
    delay(60); // 60ms delay prevents multi-path acoustic echo overlaps
  }

  if (validSamples == 0) {
    return -1.0f; // All samples invalid
  }
  return (sum / (float)validSamples);
}

// ---------------------------------------------------------------------------
// FUNCTION: calculateFillPercent()
// Converts sensor-to-waste distance to 0-100% capacity fill.
// ---------------------------------------------------------------------------
int calculateFillPercent(float distanceCm) {
  if (distanceCm < 0) return -1; // Sensor error flag

  // Fill percentage = ((Total Height - Measured Distance) / Total Height) * 100
  float fill = ((BIN_HEIGHT_CM - distanceCm) / BIN_HEIGHT_CM) * 100.0f;
  if (fill < 0.0f) fill = 0.0f;
  if (fill > 100.0f) fill = 100.0f;
  
  return (int)(fill + 0.5f); // Round to nearest integer
}

// ---------------------------------------------------------------------------
// FUNCTION: buildBinReading()
// Orchestrates reading and calculates fill metrics for a designated bin.
// ---------------------------------------------------------------------------
BinReading buildBinReading(const char* binType, int trigPin, int echoPin) {
  BinReading r;
  r.binType = binType;
  r.distanceCm = getAveragedDistance(trigPin, echoPin);
  r.fillPercent = calculateFillPercent(r.distanceCm);
  r.alertTriggered = (r.fillPercent >= FILL_THRESHOLD);

  Serial.printf("[SENSOR] %-7s | Distance: %5.1f cm | Fill: %3d%% | Alert: %s\n",
                binType, r.distanceCm, r.fillPercent,
                r.alertTriggered ? "CRITICAL (>=80%)" : "NORMAL");
  return r;
}

// ---------------------------------------------------------------------------
// FUNCTION: connectWiFi()
// Connects to configured WiFi Access Point with bounded retries.
// ---------------------------------------------------------------------------
bool connectWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: '%s' ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(400);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED)); // Toggle LED while connecting
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED, HIGH);
    Serial.printf("[WIFI] Connected! IP Address: %s (RSSI: %d dBm)\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  } else {
    digitalWrite(STATUS_LED, LOW);
    Serial.println("[WIFI] Connection failed. Check credentials/2.4GHz network.");
    return false;
  }
}

// ---------------------------------------------------------------------------
// FUNCTION: sendToCloud()
// Formats reading as JSON and executes HTTP PUT request to Firebase RTDB endpoint.
// ---------------------------------------------------------------------------
void sendToCloud(BinReading r) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[CLOUD] Skipped upload — WiFi not connected.");
    return;
  }

  HTTPClient http;
  String path = String(FIREBASE_HOST) + "/readings/" + String(SITE_ID) +
                "/" + String(r.binType) + ".json";
  if (strlen(FIREBASE_AUTH) > 0) {
    path += "?auth=" + String(FIREBASE_AUTH);
  }

  http.begin(path);
  http.addHeader("Content-Type", "application/json");

  // Build JSON payload matching SWMS specification schema
  String payload = "{";
  payload += "\"site_id\":\"" + String(SITE_ID) + "\",";
  payload += "\"bin_type\":\"" + String(r.binType) + "\",";
  payload += "\"fill_percent\":" + String(r.fillPercent) + ",";
  payload += "\"distance_cm\":" + String(r.distanceCm, 1) + ",";
  payload += "\"timestamp\":" + String((unsigned long)time(nullptr)) + ",";
  payload += "\"alert_triggered\":" + String(r.alertTriggered ? "true" : "false") + ",";
  payload += "\"device_status\":\"online\"";
  payload += "}";

  int httpCode = http.PUT(payload);

  if (httpCode >= 200 && httpCode < 300) {
    Serial.printf("[CLOUD] %-7s upload SUCCESS (HTTP %d)\n", r.binType, httpCode);
  } else {
    Serial.printf("[CLOUD] %-7s upload ERROR (HTTP %d): %s\n",
                  r.binType, httpCode, http.errorToString(httpCode).c_str());
  }
  http.end();
}

// ---------------------------------------------------------------------------
// SETUP
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================================");
  Serial.println("  Smart Waste Management System (SWMS-2026-P1) Firmware  ");
  Serial.println("========================================================");

  pinMode(STATUS_LED, OUTPUT);
  pinMode(TRIG_ORGANIC, OUTPUT);
  pinMode(ECHO_ORGANIC, INPUT);
  pinMode(TRIG_DRY, OUTPUT);
  pinMode(ECHO_DRY, INPUT);

  // Initialize trigger pins to LOW
  digitalWrite(TRIG_ORGANIC, LOW);
  digitalWrite(TRIG_DRY, LOW);

  bool wifiOk = connectWiFi();

  // Acquire dual bin measurements
  BinReading organic = buildBinReading("organic", TRIG_ORGANIC, ECHO_ORGANIC);
  BinReading dry     = buildBinReading("dry", TRIG_DRY, ECHO_DRY);

  if (wifiOk) {
    sendToCloud(organic);
    sendToCloud(dry);
  }

  Serial.printf("[POWER] Entering deep sleep for %llu seconds to conserve power...\n", SLEEP_INTERVAL_SEC);
  Serial.flush();

  // Configure timer wakeup and start deep sleep
  esp_sleep_enable_timer_wakeup(SLEEP_INTERVAL_SEC * 1000000ULL);
  esp_deep_sleep_start();
  // Upon wakeup, ESP32 resets and re-executes setup()
}

// ---------------------------------------------------------------------------
// LOOP — Intentionally empty (sleep resets MCU into setup)
// ---------------------------------------------------------------------------
void loop() {
}
