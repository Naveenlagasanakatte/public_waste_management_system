"""
============================================================================
Smart Waste Management System (SWMS-2026-P1) - Production Launcher
Tumakuru City Corporation (TMP - ತುಮಕೂರು ಮಹಾನಗರ ಪಾಲಿಕೆ)
============================================================================
"""

import os
import sys
import argparse
import uvicorn

def main():
    parser = argparse.ArgumentParser(description="Tumakuru Smart Waste Management System Server")
    parser.add_argument("--host", default=os.getenv("HOST", "0.0.0.0"), help="Host IP to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")), help="Port to bind (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable hot reload for development")
    args = parser.parse_args()

    print("=" * 75)
    print("  TUMAKURU CITY CORPORATION - SMART WASTE MANAGEMENT SYSTEM (SWMS-2026-P1)")
    print("  Integrated Municipal Command & Real-Time Monitoring Center")
    print("=" * 75)
    print(f"  * Web Command Center : http://{args.host if args.host != '0.0.0.0' else '127.0.0.1'}:{args.port}")
    print(f"  * API Docs (OpenAPI) : http://{args.host if args.host != '0.0.0.0' else '127.0.0.1'}:{args.port}/docs")
    print(f"  * City Overview API  : http://{args.host if args.host != '0.0.0.0' else '127.0.0.1'}:{args.port}/api/city/overview")
    print(f"  * QA Test Suite API  : http://{args.host if args.host != '0.0.0.0' else '127.0.0.1'}:{args.port}/api/qa/run-tests")
    print("=" * 75)
    print("  Default Municipal Staff Credentials:")
    print("  - Commissioner     : commissioner.tumkur / tumkur@swms2026")
    print("  - Zonal Officer    : officer.central     / central@tumkur2026")
    print("  - Field Inspector  : inspector.tumkur    / staff@tumkur2026")
    print("=" * 75)
    print("  Press Ctrl+C to stop server.\n")

    uvicorn.run("backend.server:app", host=args.host, port=args.port, reload=args.reload, log_level="info")

if __name__ == "__main__":
    main()
