"""
Doctor Lawyer - Server Entrypoint
Usage:
    python backend/main.py
"""

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "src"))

from src.api.server import run_server

if __name__ == "__main__":
    port = int(os.environ.get("PORT", os.environ.get("APP_PORT", 3000)))
    run_server(port)
