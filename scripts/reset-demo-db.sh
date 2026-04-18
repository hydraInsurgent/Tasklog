#!/bin/bash
# Restores the live SQLite database from the seed copy.
# Run by cron every 6 hours to keep the demo in a clean state.
#
# Assumes both files live in the same directory as this script,
# and that the backend is managed by systemd as "tasklog-api".

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_DB="$SCRIPT_DIR/TasklogDatabase.seed.db"
LIVE_DB="$SCRIPT_DIR/TasklogDatabase.db"

if [ ! -f "$SEED_DB" ]; then
  echo "ERROR: Seed database not found at $SEED_DB"
  exit 1
fi

# Stop the backend so the DB file is not locked during the copy.
systemctl stop tasklog-api

cp "$SEED_DB" "$LIVE_DB"

# Restart the backend with the restored database.
systemctl start tasklog-api

echo "$(date): Demo database reset from seed." >> "$SCRIPT_DIR/reset.log"
