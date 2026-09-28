@echo off
echo ==============================================================================
echo   TUMAKURU CITY CORPORATION (TMP - TUMAKURU MAHANAGARA PALIKE)
echo   Smart Waste Management System (SWMS-2026-P1) - Production Deployer
echo ==============================================================================
echo.

:: Check for Python
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python 3 is not installed or not in PATH! Please install Python 3.9+.
    pause
    exit /b 1
)

echo [*] Installing required Python dependencies...
python -m pip install -r requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Pip install had issues, attempting direct run...
)

echo [*] Running Alert Engine Verification Tests...
python -m unittest alert_engine/tests/test_alert_engine.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Alert Engine unit tests failed! Aborting deployment.
    pause
    exit /b 1
)
echo [OK] All Alert Engine tests passed successfully (100%% OK).

echo.
echo ==============================================================================
echo   Starting Tumakuru Command Center & API Gateway on http://127.0.0.1:8000
echo ==============================================================================
echo   - Web Dashboard:   http://127.0.0.1:8000
echo   - OpenAPI Docs:    http://127.0.0.1:8000/docs
echo   - Default Login:   commissioner.tumkur / tumkur@swms2026
echo ==============================================================================
echo.

python run_system.py --host 0.0.0.0 --port 8000
pause
