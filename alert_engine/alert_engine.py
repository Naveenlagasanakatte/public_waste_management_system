"""
============================================================================
Project   : Smart Waste Management System (SWMS-2026-P1)
Module    : Alert Engine Microservice
Purpose   : Polls Firebase Realtime Database (or Local SWMS Server) for
            dual-bin fill levels, performs state-machine de-duplication,
            and dispatches SMS (Twilio), Email (SMTP), and Webhook alerts
            with CSV audit logging.
============================================================================
"""

import argparse
import csv
import os
import smtplib
import sys
import time
from datetime import datetime
from email.mime.text import MIMEText
from typing import Any, Callable, Dict, List, Optional

import requests

# ---------------------------------------------------------------------------
# DEFAULT CONFIGURATION
# ---------------------------------------------------------------------------
DEFAULT_FIREBASE_HOST = os.getenv("FIREBASE_HOST", "http://127.0.0.1:8000")
DEFAULT_FIREBASE_AUTH = os.getenv("FIREBASE_AUTH", "")

DEFAULT_SITE_ID = os.getenv("SITE_ID", "SITE_001")
DEFAULT_BIN_TYPES = ["organic", "dry"]
DEFAULT_FILL_THRESHOLD = int(os.getenv("FILL_THRESHOLD", "80"))
DEFAULT_POLL_INTERVAL_SEC = float(os.getenv("POLL_INTERVAL_SEC", "5"))

# Twilio Configuration
TWILIO_ENABLED = os.getenv("TWILIO_ENABLED", "false").lower() in ("true", "1", "yes")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "YOUR_TWILIO_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "YOUR_TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "+15005550006")
TWILIO_TO_NUMBER = os.getenv("TWILIO_TO_NUMBER", "+919876543210")

# SMTP Configuration (Gmail or custom mailer)
SMTP_ENABLED = os.getenv("SMTP_ENABLED", "false").lower() in ("true", "1", "yes")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "municipal.corp.swms@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "sanitation.dispatch@municipal.gov")

# Webhook / Local Broadcast Endpoint
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "http://127.0.0.1:8000/api/alerts/webhook")

# CSV Audit Log Location
DEFAULT_LOG_FILE = os.path.join(os.path.dirname(__file__), "alert_log.csv")


# ---------------------------------------------------------------------------
# CLASS: BinStateMachine
# Tracks per-bin alert state to prevent duplicate alert storms:
#   NORMAL -> (fill >= threshold) -> ALERT_SENT
#   ALERT_SENT -> (fill < threshold) -> RESET to NORMAL
# ---------------------------------------------------------------------------
class BinStateMachine:
    """State machine governing alert transition per bin key."""

    def __init__(self):
        self.state: Dict[str, str] = {}  # key: f"{site_id}_{bin_type}" -> "NORMAL" | "ALERT_SENT"
        self.history: List[Dict[str, Any]] = []

    def should_alert(self, key: str, fill_percent: int, threshold: int) -> bool:
        """Determines whether a reading qualifies as a new threshold breach."""
        current = self.state.get(key, "NORMAL")

        if fill_percent >= threshold:
            if current == "NORMAL":
                self.state[key] = "ALERT_SENT"
                self.history.append({
                    "key": key,
                    "event": "BREACH",
                    "fill_percent": fill_percent,
                    "timestamp": datetime.now().isoformat()
                })
                return True  # Fresh breach!
            else:
                return False  # Already alerted in this cycle; prevent flood
        else:
            if current == "ALERT_SENT":
                # Bin was emptied below threshold; reset state so future fill will alert
                self.state[key] = "NORMAL"
                self.history.append({
                    "key": key,
                    "event": "RESET",
                    "fill_percent": fill_percent,
                    "timestamp": datetime.now().isoformat()
                })
            return False

    def get_state(self, key: str) -> str:
        return self.state.get(key, "NORMAL")

    def reset_all(self):
        self.state.clear()
        self.history.clear()


# ---------------------------------------------------------------------------
# CLASS: AlertDispatcher
# Dispatches notifications across SMS, Email, Webhooks, and Console.
# ---------------------------------------------------------------------------
class AlertDispatcher:
    def __init__(
        self,
        twilio_enabled: bool = TWILIO_ENABLED,
        smtp_enabled: bool = SMTP_ENABLED,
        webhook_enabled: bool = True,
        on_dispatch_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.twilio_enabled = twilio_enabled
        self.smtp_enabled = smtp_enabled
        self.webhook_enabled = webhook_enabled
        self.on_dispatch_callback = on_dispatch_callback
        self.twilio_client = None

        if self.twilio_enabled and TWILIO_ACCOUNT_SID != "YOUR_TWILIO_SID":
            try:
                from twilio.rest import Client
                self.twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            except Exception as e:
                print(f"[DISPATCHER] Failed to initialize Twilio client: {e}")

    def send_sms(self, message: str) -> bool:
        if not self.twilio_enabled or self.twilio_client is None:
            return False
        try:
            self.twilio_client.messages.create(
                body=message, from_=TWILIO_FROM_NUMBER, to=TWILIO_TO_NUMBER
            )
            print(f"[ALERT][SMS] Dispatched to {TWILIO_TO_NUMBER}")
            return True
        except Exception as e:
            print(f"[ALERT][SMS] Delivery failed: {e}")
            return False

    def send_email(self, subject: str, message: str) -> bool:
        if not self.smtp_enabled or not SMTP_PASSWORD:
            return False
        try:
            msg = MIMEText(message)
            msg["Subject"] = subject
            msg["From"] = SMTP_USERNAME
            msg["To"] = ALERT_EMAIL_TO

            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
            print(f"[ALERT][EMAIL] Dispatched to {ALERT_EMAIL_TO}")
            return True
        except Exception as e:
            print(f"[ALERT][EMAIL] Delivery failed: {e}")
            return False

    def send_webhook(self, payload: Dict[str, Any]) -> bool:
        if not self.webhook_enabled or not WEBHOOK_URL:
            return False
        try:
            resp = requests.post(WEBHOOK_URL, json=payload, timeout=5)
            return resp.status_code in (200, 201)
        except Exception:
            # Backend might be silent or running locally
            return False

    def dispatch(self, site_id: str, bin_type: str, fill_percent: int) -> Dict[str, Any]:
        """Sends alert through all active communication channels."""
        subject = f"SWMS URGENT: {bin_type.upper()} bin at {site_id} is FULL ({fill_percent}%)"
        message = (
            f"Municipal Waste Alert: Site {site_id} [{bin_type.upper()} bin] "
            f"has reached {fill_percent}% capacity. Immediate truck dispatch required."
        )

        print(f"\n[ALERT TRIGGERED] Site: {site_id} | Bin: {bin_type.upper()} | Level: {fill_percent}%")

        sms_ok = self.send_sms(message)
        email_ok = self.send_email(subject, message)
        
        event_payload = {
            "timestamp": datetime.now().isoformat(),
            "site_id": site_id,
            "bin_type": bin_type,
            "fill_percent": fill_percent,
            "subject": subject,
            "message": message,
            "channels": {
                "sms": sms_ok or (not self.twilio_enabled),
                "email": email_ok or (not self.smtp_enabled),
                "console": True
            }
        }

        self.send_webhook(event_payload)

        if self.on_dispatch_callback:
            self.on_dispatch_callback(event_payload)

        return event_payload


# ---------------------------------------------------------------------------
# FUNCTION: log_alert()
# Appends an alert audit record to the CSV file with ISO timestamp.
# ---------------------------------------------------------------------------
def log_alert(
    site_id: str,
    bin_type: str,
    fill_percent: int,
    action_taken: str,
    log_file: str = DEFAULT_LOG_FILE
):
    os.makedirs(os.path.dirname(os.path.abspath(log_file)), exist_ok=True)
    file_exists = os.path.isfile(log_file)
    with open(log_file, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "site_id", "bin_type", "fill_percent", "action_taken"])
        writer.writerow([
            datetime.now().isoformat(),
            site_id,
            bin_type,
            fill_percent,
            action_taken
        ])


# ---------------------------------------------------------------------------
# FUNCTION: fetch_reading()
# Retrieves latest bin status from Firebase REST endpoint or local server.
# ---------------------------------------------------------------------------
def fetch_reading(
    host: str,
    site_id: str,
    bin_type: str,
    auth_token: str = ""
) -> Optional[Dict[str, Any]]:
    # Firebase REST URL pattern: <host>/readings/<site_id>/<bin_type>.json
    url = f"{host.rstrip('/')}/readings/{site_id}/{bin_type}.json"
    if auth_token:
        url += f"?auth={auth_token}"

    try:
        resp = requests.get(url, timeout=6)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        # Debug print omitted to reduce noise during connection retries
        pass
    return None


# ---------------------------------------------------------------------------
# CLASS: AlertEngine
# Encapsulates polling loop, state evaluation, and alert dispatching.
# ---------------------------------------------------------------------------
class AlertEngine:
    def __init__(
        self,
        host: str = DEFAULT_FIREBASE_HOST,
        auth_token: str = DEFAULT_FIREBASE_AUTH,
        site_id: str = DEFAULT_SITE_ID,
        bin_types: Optional[List[str]] = None,
        threshold: int = DEFAULT_FILL_THRESHOLD,
        poll_interval: float = DEFAULT_POLL_INTERVAL_SEC,
        log_file: str = DEFAULT_LOG_FILE,
        dispatcher: Optional[AlertDispatcher] = None
    ):
        self.host = host
        self.auth_token = auth_token
        self.site_id = site_id
        self.bin_types = bin_types or DEFAULT_BIN_TYPES
        self.threshold = threshold
        self.poll_interval = poll_interval
        self.log_file = log_file
        self.state_machine = BinStateMachine()
        self.dispatcher = dispatcher or AlertDispatcher()
        self.is_running = False

    def poll_once(self) -> List[Dict[str, Any]]:
        """Executes a single polling cycle over all monitored bin types."""
        dispatched_events = []
        for bin_type in self.bin_types:
            reading = fetch_reading(self.host, self.site_id, bin_type, self.auth_token)
            if not reading or "fill_percent" not in reading:
                continue

            fill = int(reading["fill_percent"])
            key = f"{self.site_id}_{bin_type}"

            if self.state_machine.should_alert(key, fill, self.threshold):
                evt = self.dispatcher.dispatch(self.site_id, bin_type, fill)
                action = "ALERT_DISPATCHED"
                log_alert(self.site_id, bin_type, fill, action, self.log_file)
                dispatched_events.append(evt)

        return dispatched_events

    def run(self):
        """Continuous polling loop."""
        self.is_running = True
        print("=" * 65)
        print("  SWMS-2026-P1 Alert Engine Microservice Running")
        print(f"  Target Host  : {self.host}")
        print(f"  Monitored Site: {self.site_id}")
        print(f"  Bins         : {', '.join(self.bin_types)}")
        print(f"  Threshold    : >= {self.threshold}%")
        print(f"  Poll Interval: {self.poll_interval}s")
        print("=" * 65)

        try:
            while self.is_running:
                self.poll_once()
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            print("\n[SHUTDOWN] Alert Engine stopped by user.")


# ---------------------------------------------------------------------------
# CLI ENTRYPOINT
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SWMS Alert Engine Microservice")
    parser.add_argument("--host", default=DEFAULT_FIREBASE_HOST, help="Firebase or Local API URL")
    parser.add_argument("--site", default=DEFAULT_SITE_ID, help="Site ID to monitor")
    parser.add_argument("--threshold", type=int, default=DEFAULT_FILL_THRESHOLD, help="Fill % alert threshold")
    parser.add_argument("--interval", type=float, default=DEFAULT_POLL_INTERVAL_SEC, help="Poll interval in seconds")
    parser.add_argument("--log", default=DEFAULT_LOG_FILE, help="Path to alert CSV log")
    args = parser.parse_args()

    engine = AlertEngine(
        host=args.host,
        site_id=args.site,
        threshold=args.threshold,
        poll_interval=args.interval,
        log_file=args.log,
    )
    engine.run()
