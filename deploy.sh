#!/usr/bin/env bash
# ==============================================================================
# TUMAKURU CITY CORPORATION (TMP) - SMART WASTE MANAGEMENT SYSTEM (SWMS-2026-P1)
# Production Deployment Script for Linux / Cloud / Docker / systemd
# ==============================================================================

set -e

echo "=============================================================================="
echo "  TUMAKURU CITY CORPORATION - SWMS-2026-P1 PRODUCTION DEPLOYMENT"
echo "=============================================================================="

# Check deployment mode
MODE="${1:-native}"

if [ "$MODE" = "docker" ]; then
    echo "[*] Deploying via Docker Compose..."
    docker-compose down || true
    docker-compose up -d --build
    echo "[OK] Tumakuru SWMS container running on port 8000."
    echo "     Dashboard: http://localhost:8000"
    docker-compose logs -f
    exit 0
fi

# Native Python Deployment
echo "[*] Setting up Python virtual environment..."
python3 -m venv venv || virtualenv venv
source venv/bin/activate

echo "[*] Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

echo "[*] Running verification test suite..."
python -m unittest alert_engine/tests/test_alert_engine.py

echo "[*] Starting production server on 0.0.0.0:8000..."
python run_system.py --host 0.0.0.0 --port "${PORT:-8000}"
