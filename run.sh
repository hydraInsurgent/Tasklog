#!/bin/bash
# run.sh
# Starts both the backend and frontend for local development.
#
# What it does:
#   1. Starts the .NET backend (dotnet run) on http://localhost:5115
#   2. Starts the Next.js frontend (npm run dev) on http://localhost:3000
#   3. Stops both when you press Ctrl+C
#
# Usage:
#   ./run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend/Tasklog.Api"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Verify directories exist.
if [ ! -d "$BACKEND_DIR" ]; then
    echo "ERROR: Backend not found at $BACKEND_DIR"
    exit 1
fi
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "ERROR: Frontend not found at $FRONTEND_DIR"
    exit 1
fi

# Clean up both processes on exit.
cleanup() {
    echo ""
    echo "Stopping..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    echo "Stopped."
}
trap cleanup SIGINT SIGTERM

echo ""
echo "Starting Tasklog..."
echo "  Backend:  http://localhost:5115"
echo "  Frontend: http://localhost:3000"
echo "  Press Ctrl+C to stop both."
echo ""

# Start the backend as a background process.
(cd "$BACKEND_DIR" && dotnet run) &
BACKEND_PID=$!

# Start the frontend as a background process.
(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!

# Keep the script alive until interrupted.
wait
