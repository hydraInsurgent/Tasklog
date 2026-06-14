#!/bin/bash
# run.sh - Start backend + frontend for local dev (PC and phone on same WiFi).
#
# Usage: ./run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend/Tasklog.Api"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

if [ ! -d "$BACKEND_DIR" ]; then echo "ERROR: Backend not found at $BACKEND_DIR"; exit 1; fi
if [ ! -d "$FRONTEND_DIR" ]; then echo "ERROR: Frontend not found at $FRONTEND_DIR"; exit 1; fi

LOCAL_IP=$(ip route get 1 2>/dev/null | grep -oP 'src \K[\d.]+' | head -1)

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
echo "  Backend:  http://0.0.0.0:5115"
echo "  Frontend: http://0.0.0.0:3000"
if [ -n "$LOCAL_IP" ]; then
    echo "  Phone:    http://$LOCAL_IP:3000"
fi
echo "  Press Ctrl+C to stop both."
echo ""

(cd "$BACKEND_DIR" && dotnet run --urls http://0.0.0.0:5115) &
BACKEND_PID=$!

(cd "$FRONTEND_DIR" && PORT=3000 npx next dev --hostname 0.0.0.0) &
FRONTEND_PID=$!

sleep 3
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "ERROR: Backend failed to start."
    kill "$FRONTEND_PID" 2>/dev/null
    exit 1
fi
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "ERROR: Frontend failed to start."
    kill "$BACKEND_PID" 2>/dev/null
    exit 1
fi

wait
