"""
============================================================================
Unit Tests for Alert Engine Microservice (SWMS-2026-P1)
Covers: State Machine, De-duplication, Reset logic, CSV Logging, Dispatcher.
============================================================================
"""

import csv
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from alert_engine.alert_engine import (
    AlertDispatcher,
    AlertEngine,
    BinStateMachine,
    log_alert,
)


class TestBinStateMachine(unittest.TestCase):
    def setUp(self):
        self.sm = BinStateMachine()
        self.key = "SITE_001_organic"
        self.threshold = 80

    def test_initial_state_under_threshold(self):
        """Under-threshold readings should return False and keep state NORMAL."""
        self.assertFalse(self.sm.should_alert(self.key, 45, self.threshold))
        self.assertEqual(self.sm.get_state(self.key), "NORMAL")

    def test_threshold_breach_triggers_alert(self):
        """Crossing threshold (e.g. 85%) should trigger an alert (return True)."""
        self.assertTrue(self.sm.should_alert(self.key, 85, self.threshold))
        self.assertEqual(self.sm.get_state(self.key), "ALERT_SENT")

    def test_deduplication_prevents_duplicate_alerts(self):
        """Keeping bin full across subsequent cycles must NOT re-trigger alerts."""
        # 1st cycle: breach
        self.assertTrue(self.sm.should_alert(self.key, 85, self.threshold))
        # 2nd cycle: still full
        self.assertFalse(self.sm.should_alert(self.key, 90, self.threshold))
        # 3rd cycle: 100% full
        self.assertFalse(self.sm.should_alert(self.key, 100, self.threshold))
        self.assertEqual(self.sm.get_state(self.key), "ALERT_SENT")

    def test_empty_bin_resets_state_machine(self):
        """Emptying bin below threshold must reset state from ALERT_SENT to NORMAL."""
        # Breach
        self.sm.should_alert(self.key, 85, self.threshold)
        self.assertEqual(self.sm.get_state(self.key), "ALERT_SENT")

        # Emptied (e.g. to 10%)
        self.assertFalse(self.sm.should_alert(self.key, 10, self.threshold))
        self.assertEqual(self.sm.get_state(self.key), "NORMAL")

        # Refilling above threshold must now fire a new alert
        self.assertTrue(self.sm.should_alert(self.key, 82, self.threshold))
        self.assertEqual(self.sm.get_state(self.key), "ALERT_SENT")


class TestAlertLogging(unittest.TestCase):
    def test_csv_logging(self):
        """Verify CSV log creation, headers, and correct audit data formatting."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = os.path.join(tmpdir, "test_alert_log.csv")

            log_alert("SITE_001", "organic", 88, "ALERT_DISPATCHED", log_file=log_path)
            log_alert("SITE_001", "dry", 92, "ALERT_DISPATCHED", log_file=log_path)

            self.assertTrue(os.path.exists(log_path))
            with open(log_path, mode="r", encoding="utf-8") as f:
                reader = list(csv.reader(f))
                self.assertEqual(len(reader), 3)  # Header + 2 entries
                self.assertEqual(reader[0], ["timestamp", "site_id", "bin_type", "fill_percent", "action_taken"])
                self.assertEqual(reader[1][1], "SITE_001")
                self.assertEqual(reader[1][2], "organic")
                self.assertEqual(reader[1][3], "88")
                self.assertEqual(reader[1][4], "ALERT_DISPATCHED")


class TestAlertDispatcher(unittest.TestCase):
    def test_dispatcher_callback(self):
        """Ensure dispatcher triggers callbacks and formats payload properly."""
        callback_received = []

        dispatcher = AlertDispatcher(
            twilio_enabled=False,
            smtp_enabled=False,
            webhook_enabled=False,
            on_dispatch_callback=lambda payload: callback_received.append(payload)
        )

        payload = dispatcher.dispatch("SITE_001", "dry", 84)
        self.assertEqual(len(callback_received), 1)
        self.assertEqual(callback_received[0]["site_id"], "SITE_001")
        self.assertEqual(callback_received[0]["bin_type"], "dry")
        self.assertEqual(callback_received[0]["fill_percent"], 84)


if __name__ == "__main__":
    unittest.main()
