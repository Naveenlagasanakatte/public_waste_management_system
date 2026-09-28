"""
============================================================================
Project   : Smart Waste Management System (SWMS-2026-P1)
Module    : IoT Dual-Bin Hardware & Sensor Simulator
Purpose   : Emulates ESP32 MCU and dual HC-SR04 ultrasonic sensors.
            Simulates acoustic pulse-echo time, 5-sample averaging debounce,
            waste accumulation, empty actions, and HTTP PUT uploads to
            Firebase or the local SWMS gateway.
============================================================================
"""

import argparse
import random
import time
from datetime import datetime
from typing import Dict, List, Optional
import requests


class HCSR04SensorSimulator:
    """Simulates physical HC-SR04 ultrasonic sensor with acoustic physics & noise."""

    def __init__(self, bin_height_cm: float = 50.0, noise_std_dev: float = 0.5):
        self.bin_height_cm = bin_height_cm
        self.noise_std_dev = noise_std_dev
        self.fault_mode = False

    def measure_pulse_duration_us(self, actual_distance_cm: float) -> int:
        """Simulates round-trip ultrasonic time in microseconds (Speed of sound: 343 m/s)."""
        if self.fault_mode:
            return 0  # Simulates hardware timeout or disconnected sensor

        # Add physical noise
        measured_cm = actual_distance_cm + random.gauss(0, self.noise_std_dev)
        if measured_cm < 2.0:
            measured_cm = 2.0  # HC-SR04 blind spot minimum

        # Distance = (Duration * 0.0343) / 2  --> Duration = (Distance * 2) / 0.0343
        duration_us = int((measured_cm * 2.0) / 0.0343)
        return duration_us

    def read_distance(self, actual_distance_cm: float) -> float:
        """Emulates readSensor() from firmware."""
        duration_us = self.measure_pulse_duration_us(actual_distance_cm)
        if duration_us == 0 or duration_us > 30000:
            return -1.0
        return (duration_us * 0.0343) / 2.0

    def get_averaged_distance(self, actual_distance_cm: float, sample_count: int = 5) -> float:
        """Emulates getAveragedDistance() from firmware."""
        samples = []
        for _ in range(sample_count):
            d = self.read_distance(actual_distance_cm)
            if d > 1.0 and d <= (self.bin_height_cm + 20.0):
                samples.append(d)
        if not samples:
            return -1.0
        return sum(samples) / len(samples)


class SimulatedBin:
    """Represents a physical bin with fill level and sensor."""

    def __init__(self, bin_type: str, bin_height_cm: float = 50.0, initial_fill_percent: int = 20):
        self.bin_type = bin_type
        self.bin_height_cm = bin_height_cm
        self.fill_percent = initial_fill_percent
        self.sensor = HCSR04SensorSimulator(bin_height_cm=bin_height_cm)

    @property
    def true_distance_cm(self) -> float:
        """Converts fill percentage to actual distance from top sensor to waste."""
        return self.bin_height_cm * (1.0 - (self.fill_percent / 100.0))

    def calculate_firmware_fill_percent(self, measured_distance_cm: float) -> int:
        """Firmware calculation logic."""
        if measured_distance_cm < 0:
            return -1
        fill = ((self.bin_height_cm - measured_distance_cm) / self.bin_height_cm) * 100.0
        return max(0, min(100, int(round(fill))))

    def sample_and_calculate(self, sample_count: int = 5) -> Dict[str, any]:
        avg_dist = self.sensor.get_averaged_distance(self.true_distance_cm, sample_count=sample_count)
        calc_fill = self.calculate_firmware_fill_percent(avg_dist)
        return {
            "bin_type": self.bin_type,
            "distance_cm": round(avg_dist, 1) if avg_dist >= 0 else -1,
            "fill_percent": calc_fill,
            "alert_triggered": calc_fill >= 80,
        }

    def add_waste(self, percent_increase: int):
        self.fill_percent = min(100, self.fill_percent + percent_increase)

    def empty_bin(self):
        self.fill_percent = 0


class IoTDeviceSimulator:
    """Simulates an ESP32 device running at a municipal site."""

    def __init__(
        self,
        site_id: str = "SITE_001",
        target_host: str = "http://127.0.0.1:8000",
        bin_height_cm: float = 50.0,
        threshold: int = 80,
        sleep_interval_sec: float = 10.0,
    ):
        self.site_id = site_id
        self.target_host = target_host.rstrip("/")
        self.threshold = threshold
        self.sleep_interval_sec = sleep_interval_sec
        self.organic_bin = SimulatedBin("organic", bin_height_cm=bin_height_cm, initial_fill_percent=35)
        self.dry_bin = SimulatedBin("dry", bin_height_cm=bin_height_cm, initial_fill_percent=45)
        self.is_running = False

    def send_to_cloud(self, reading: Dict[str, any]) -> bool:
        """PUTs reading to Firebase/Local server matching firmware payload."""
        url = f"{self.target_host}/readings/{self.site_id}/{reading['bin_type']}.json"
        payload = {
            "site_id": self.site_id,
            "bin_type": reading["bin_type"],
            "fill_percent": reading["fill_percent"],
            "distance_cm": reading["distance_cm"],
            "timestamp": int(time.time()),
            "alert_triggered": reading["alert_triggered"],
            "device_status": "online",
        }
        try:
            resp = requests.put(url, json=payload, timeout=5)
            return resp.status_code in (200, 201, 204)
        except Exception as e:
            print(f"[SIMULATOR][ERROR] Cloud sync failed for {reading['bin_type']}: {e}")
            return False

    def cycle_once(self, simulate_growth: bool = True) -> List[Dict[str, any]]:
        if simulate_growth:
            # Organic waste fills steadily, dry waste fills in bursts
            if random.random() < 0.65:
                self.organic_bin.add_waste(random.randint(1, 4))
            if random.random() < 0.50:
                self.dry_bin.add_waste(random.randint(2, 6))

        r_org = self.organic_bin.sample_and_calculate()
        r_dry = self.dry_bin.sample_and_calculate()

        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] {self.site_id} | "
            f"Organic: {r_org['fill_percent']:3d}% ({r_org['distance_cm']:4.1f}cm) | "
            f"Dry: {r_dry['fill_percent']:3d}% ({r_dry['distance_cm']:4.1f}cm)"
        )

        self.send_to_cloud(r_org)
        self.send_to_cloud(r_dry)

        return [r_org, r_dry]

    def run(self):
        self.is_running = True
        print(f"[SIMULATOR] Starting ESP32 telemetry simulator for {self.site_id} -> {self.target_host}")
        try:
            while self.is_running:
                self.cycle_once(simulate_growth=True)
                time.sleep(self.sleep_interval_sec)
        except KeyboardInterrupt:
            print("[SIMULATOR] Stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SWMS IoT Bin Hardware Simulator")
    parser.add_argument("--host", default="http://127.0.0.1:8000", help="Target API host")
    parser.add_argument("--site", default="SITE_001", help="Site identifier")
    parser.add_argument("--interval", type=float, default=5.0, help="Cycle interval in seconds")
    args = parser.parse_args()

    sim = IoTDeviceSimulator(site_id=args.site, target_host=args.host, sleep_interval_sec=args.interval)
    sim.run()
