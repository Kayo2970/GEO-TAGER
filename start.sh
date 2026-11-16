#!/bin/bash
cd "$(dirname "$0")"
echo "===================================="
echo "    Starting GEO-TAGER..."
echo "===================================="

if [ -f ".venv/bin/python" ]; then
    PYTHON_CMD=".venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python"
fi

$PYTHON_CMD code/app.py &
SERVER_PID=$!

sleep 1

if command -v xdg-open &>/dev/null; then
    xdg-open "http://127.0.0.1:5000"
elif command -v open &>/dev/null; then
    open "http://127.0.0.1:5000"
fi

echo "Server running at http://127.0.0.1:5000"
echo "Press Ctrl+C to stop."
wait $SERVER_PID
