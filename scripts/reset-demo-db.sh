#!/bin/bash
# Restores the live SQLite database from the seed copy.
# Run by cron every 6 hours to keep the demo in a clean state.
#
# DB files live in the backend directory alongside the API binary.
# The backend is managed by systemd as "tasklog-api".

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"
SEED_DB="$BACKEND_DIR/TasklogDatabase.seed.db"
LIVE_DB="$BACKEND_DIR/TasklogDatabase.db"

if [ ! -f "$SEED_DB" ]; then
  echo "ERROR: Seed database not found at $SEED_DB"
  exit 1
fi

# Stop the backend so the DB file is not locked during the copy.
sudo systemctl stop tasklog-api

cp "$SEED_DB" "$LIVE_DB"

# Restart the backend with the restored database.
sudo systemctl start tasklog-api

echo "$(date): Demo database reset from seed." >> "$SCRIPT_DIR/reset.log"

