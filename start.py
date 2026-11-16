#!/usr/bin/env python3
"""
GEO-TAGER Universal Cross-Platform Launcher
Works on Windows, macOS, and Linux.
Usage: python start.py (or double-click)
"""
import sys
import os
import subprocess
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
CODE_DIR = ROOT_DIR / "code"
INDEX_HTML = ROOT_DIR / "index.html"


def find_python():
    """Find the best Python executable to run the server."""
    candidates = [
        ROOT_DIR / ".venv" / "bin" / "python",
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        CODE_DIR / ".venv" / "bin" / "python",
        CODE_DIR / ".venv" / "Scripts" / "python.exe",
        Path(sys.executable),
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return sys.executable or "python3"


def launch_server():
    """Try to start the Flask backend server and open the browser."""
    py_cmd = find_python()
    app_py = CODE_DIR / "app.py"

    if not app_py.is_file():
        # Fallback to opening standalone index.html
        print(f"Flask backend not found at {app_py}. Opening standalone HTML mode...")
        webbrowser.open(INDEX_HTML.as_uri())
        return

    print("====================================")
    print("    Starting GEO-TAGER...")
    print("====================================")
    print(f"Using Python: {py_cmd}")

    try:
        proc = subprocess.Popen([py_cmd, str(app_py)], cwd=str(ROOT_DIR))
        time.sleep(1.2)

        # Check if process is still running
        if proc.poll() is None:
            url = "http://127.0.0.1:5000"
            print(f"GEO-TAGER is running at {url}")
            webbrowser.open(url)
            print("Press Ctrl+C to stop the server.")
            try:
                proc.wait()
            except KeyboardInterrupt:
                print("\nStopping GEO-TAGER server...")
                proc.terminate()
                proc.wait()
        else:
            print("Server process exited unexpectedly. Opening standalone HTML app instead...")
            webbrowser.open(INDEX_HTML.as_uri())
    except Exception as err:
        print(f"Could not start Python backend ({err}). Opening standalone HTML app...")
        webbrowser.open(INDEX_HTML.as_uri())


if __name__ == "__main__":
    launch_server()
