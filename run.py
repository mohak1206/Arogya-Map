"""
Arogya Map — Application Entry Point
Run this file to start the Flask server.

Usage:
    python run.py
"""

import sys
import os

# Add backend directory to Python path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
sys.path.insert(0, backend_dir)

from app import app
from config import Config

if __name__ == '__main__':
    port = Config.FLASK_PORT
    debug = Config.FLASK_DEBUG
    print("\n" + "=" * 60)
    print("  Arogya Map — Smart Emergency Healthcare System")
    print(f"  Server starting at: http://127.0.0.1:{port}")
    print("=" * 60 + "\n")
    app.run(debug=debug, port=port)

