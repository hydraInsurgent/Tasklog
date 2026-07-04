#!/bin/bash
# Restores the live SQLite database from the seed copy, then RE-DATES it so the
# demo always looks freshly used: every date in the seed is shifted forward by
# the number of days since the seed was built. A task that was "due today" at
# seed time is due today at every reset, streaks end today, and the timeline
# shows the last few days - forever, without regenerating the seed.
#
# The seed carries its build date in a tiny `_seed_meta` table (added by the
# seeding process; EF ignores unknown tables). If the marker is missing, the
# newest Tasks.CreatedAt date is used as the anchor instead.
#
# Run by cron every 6 hours. DB files live in the backend directory alongside
# the API binary; the backend is managed by systemd as "tasklog-api".

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

# Shift every stored date forward by (today - seed anchor) whole days.
# EF stores datetimes as TEXT ("YYYY-MM-DD HH:MM:SS.fffffff"); SQLite's date
# functions reject 7-digit fractions, so we do string surgery instead: re-date
# the first 10 characters and keep the time-of-day verbatim. That also
# preserves the midnight "date-only deadline" sentinel exactly.
python3 - "$LIVE_DB" <<'PYEOF'
import sqlite3, sys
from datetime import date

db = sqlite3.connect(sys.argv[1])
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}

anchor = None
if "_seed_meta" in tables:
    row = db.execute("SELECT AnchorDate FROM _seed_meta").fetchone()
    anchor = row and row[0]
if not anchor:
    row = db.execute("SELECT MAX(date(CreatedAt)) FROM Tasks").fetchone()
    anchor = row and row[0]
if not anchor:
    print("re-date: no anchor found, skipping shift")
    sys.exit(0)

days = (date.today() - date.fromisoformat(anchor)).days
if days <= 0:
    print(f"re-date: anchor {anchor} is current, nothing to shift")
    sys.exit(0)

# (table, column) pairs to shift; tables absent from this schema are skipped,
# so the same script keeps working when v3 adds the journal tables.
COLUMNS = [
    ("Tasks", "Deadline"), ("Tasks", "CreatedAt"), ("Tasks", "CompletedAt"),
    ("Subtasks", "Deadline"), ("Subtasks", "CreatedAt"),
    ("CheckIns", "CheckInDate"), ("CheckIns", "CreatedAt"),
    ("TimeEntries", "StartedAt"), ("TimeEntries", "EndedAt"), ("TimeEntries", "CreatedAt"),
    ("Comments", "CreatedAt"),
    ("Projects", "CreatedAt"), ("Labels", "CreatedAt"),
    ("JournalEntries", "EntryDate"), ("JournalEntries", "CreatedAt"), ("JournalEntries", "UpdatedAt"),
    ("MoodCheckins", "CheckinAt"), ("MoodCheckins", "CreatedAt"),
]
# Two-phase shift: dates move row by row, and unique indexes like
# CheckIns(TaskId, CheckInDate) reject a row landing on a date another row
# still occupies. Jumping everything +100000 days into empty space first,
# then back down to (original + days), never collides.
OFFSET = 100000
def shift(col_expr_days):
    total = 0
    for table, col in COLUMNS:
        if table not in tables:
            continue
        cur = db.execute(
            f"UPDATE {table} SET {col} = date(substr({col},1,10), '{col_expr_days} days') || substr({col},11) "
            f"WHERE {col} IS NOT NULL"
        )
        total += cur.rowcount
    return total

shift(f"+{OFFSET}")
shifted = shift(f"-{OFFSET - days}")
db.commit()
print(f"re-date: shifted {shifted} values by +{days} days (anchor {anchor})")
PYEOF

# Restart the backend with the restored database.
sudo systemctl start tasklog-api

echo "$(date): Demo database reset from seed (re-dated)." >> "$SCRIPT_DIR/reset.log"
