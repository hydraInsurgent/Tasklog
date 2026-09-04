#!/usr/bin/env bash
# Seed / refill demo data for the time-tracking feature (#86), modeled on Manu's real Toggl
# structure: clients (life areas) -> projects, a few planned tasks, and the LAST 7 DAYS of
# time entries (task-free life-logging + task-linked work).
#
# RE-RUNNABLE: clients/projects/tasks are get-or-created by name (no duplicates), and the
# trailing-7-day entry window is cleared before refilling. Run it any day to top up the week.
# Dates are relative to "today", so a run 3 days from now refills that week instead.
#
# Usage:  ./scripts/seed-demo.sh            (defaults to http://localhost:5115)
#         API=http://192.168.1.47:5115 ./scripts/seed-demo.sh
set -euo pipefail
API="${API:-http://localhost:5115}"
NOW_TS=$(date +%s)

post()  { curl -s -X POST   "$API$1" -H "Content-Type: application/json" -d "$2"; }
patch() { curl -s -X PATCH  "$API$1" -H "Content-Type: application/json" -d "$2"; }
del()   { curl -s -X DELETE "$API$1" -o /dev/null; }

declare -A CLIENT PROJ

# Find an id in a list endpoint by a string field (default .name); empty if not found.
find_id() { curl -s "$API$1" | jq -r --arg n "$2" --arg f "${3:-name}" '.[] | select(.[$f]==$n) | .id' | head -1; }

get_or_create_client() { # name color
  local id; id=$(find_id /api/clients "$1")
  [ -z "$id" ] && id=$(post /api/clients "{\"name\":\"$1\",\"color\":\"$2\"}" | jq -r '.id')
  CLIENT[$1]=$id
}
get_or_create_project() { # name clientKey color
  local id; id=$(find_id /api/projects "$1")
  if [ -z "$id" ]; then
    id=$(post /api/projects "{\"name\":\"$1\",\"color\":\"$3\",\"clientId\":${CLIENT[$2]}}" | jq -r '.id')
  else
    patch "/api/projects/$id" "{\"clientId\":${CLIENT[$2]}}" > /dev/null  # ensure grouping
  fi
  PROJ[$1]=$id
}
get_or_create_task() { # title projectKey [deadline]
  local id; id=$(find_id /api/tasks "$1" "title")
  if [ -z "$id" ]; then
    local body="{\"title\":\"$1\",\"projectId\":${PROJ[$2]}"
    [ "${3:-}" != "" ] && body="$body,\"deadline\":\"$3\""
    id=$(post /api/tasks "$body}" | jq -r '.id')
  fi
  echo "$id"
}
# entry dayOffset startHHMM endHHMM description projectKeyOrEmpty taskIdOrEmpty
entry() {
  local d; d=$(date -d "-$1 day" +%Y-%m-%d)
  local end_ts; end_ts=$(date -d "${d}T$3:00" +%s)
  [ "$end_ts" -gt "$NOW_TS" ] && return 0   # skip the future (today's later hours)
  local body="{\"startedAt\":\"${d}T$2:00\",\"endedAt\":\"${d}T$3:00\",\"description\":\"$4\""
  [ -n "$5" ] && body="$body,\"projectId\":${PROJ[$5]}"
  [ -n "$6" ] && body="$body,\"taskId\":$6"
  post /api/time-entries "$body}" > /dev/null
}

echo "Clients (get-or-create)..."
get_or_create_client "Self"                 "#d92b2b"
get_or_create_client "Family"               "#9e5bd9"
get_or_create_client "Leisure"              "#0b83d9"
get_or_create_client "Work"                 "#bf7000"
get_or_create_client "Sleep"                "#990099"
get_or_create_client "Personal Development" "#465bb3"
get_or_create_client "Relationships"        "#d94182"

echo "Projects (get-or-create + group)..."
get_or_create_project "Routines"       "Self"                 "#d94182"
get_or_create_project "Food"           "Self"                 "#2da608"
get_or_create_project "Self Care"      "Self"                 "#d92b2b"
get_or_create_project "Responsibility" "Family"               "#9e5bd9"
get_or_create_project "Chores"         "Family"               "#e36a00"
get_or_create_project "Gaming"         "Leisure"              "#9e5bd9"
get_or_create_project "Youtube"        "Leisure"              "#06a893"
get_or_create_project "UI Revamp"      "Work"                 "#566614"
get_or_create_project "POF Support"    "Work"                 "#bf7000"
get_or_create_project "Night Sleep"    "Sleep"                "#0b83d9"
get_or_create_project "Journaling"     "Personal Development" "#465bb3"
get_or_create_project "Friends"        "Relationships"        "#9e5bd9"

echo "Tasks (planned)..."
TODAY=$(date +%Y-%m-%d); TOMORROW=$(date -d "+1 day" +%Y-%m-%d)
T_TIMELINE=$(get_or_create_task "Finish timeline redesign" "UI Revamp" "$TODAY")
get_or_create_task "Review PR from the team" "UI Revamp"   "$TOMORROW" > /dev/null
get_or_create_task "POF support tickets"     "POF Support" ""          > /dev/null
get_or_create_task "Grocery run"             "Chores"      "$TODAY"    > /dev/null
get_or_create_task "Write morning pages"     "Journaling"  ""          > /dev/null

echo "Clearing the last-7-days entry window (so a re-run refills, not duplicates)..."
FROM="$(date -d '-6 day' +%Y-%m-%d)T00:00:00"
TO="$(date -d '+1 day' +%Y-%m-%d)T00:00:00"
for eid in $(curl -s "$API/api/time-entries?from=$FROM&to=$TO" | jq -r '.[].id'); do del "/api/time-entries/$eid"; done

echo "Filling the last 7 days..."
for off in 0 1 2 3 4 5 6; do
  weekend=0; dow=$(date -d "-$off day" +%u); [ "$dow" -ge 6 ] && weekend=1

  entry "$off" "00:05" "06:20" "Sleep"           "Night Sleep"    ""
  entry "$off" "06:20" "07:00" "Empire Overdose" "Gaming"         ""
  entry "$off" "07:00" "08:05" "Rise and Shine"  "Responsibility" ""
  entry "$off" "08:05" "09:40" "Morning Ritual"  "Routines"       ""
  entry "$off" "09:40" "10:00" "Plan the day"    "Journaling"     ""

  if [ "$weekend" -eq 1 ]; then
    entry "$off" "10:00" "12:30" "Room Cleaning"   "Self Care" ""
    entry "$off" "12:30" "13:15" "Brunch"          "Food"      ""
    entry "$off" "13:15" "16:00" "Gaming session"  "Gaming"    ""
    entry "$off" "16:00" "16:30" "Calling Buddies" "Friends"   ""
    entry "$off" "16:30" "18:30" "Youtube"         "Youtube"   ""
    entry "$off" "18:30" "19:15" "Dinner"          "Food"      ""
    entry "$off" "19:15" "22:30" "Movie night"     "Youtube"   ""
  else
    entry "$off" "10:00" "13:00" "Work Focus"   "UI Revamp"   "$T_TIMELINE"
    entry "$off" "13:00" "13:40" "Brunch"       "Food"        ""
    entry "$off" "13:40" "14:00" "House Chores" "Chores"      ""
    entry "$off" "14:00" "17:00" "Work Focus"   "UI Revamp"   "$T_TIMELINE"
    entry "$off" "17:00" "17:30" "POF tickets"  "POF Support" ""
    entry "$off" "17:30" "19:00" "Youtube"      "Youtube"     ""
    entry "$off" "19:00" "19:40" "Dinner"       "Food"        ""
    entry "$off" "19:40" "22:00" "Self Care"    "Self Care"   ""
    entry "$off" "22:00" "23:55" "Reading"      "Journaling"  ""
  fi
done

echo
echo "Done. Clients: ${#CLIENT[@]}, Projects: ${#PROJ[@]}, entries in window: $(curl -s "$API/api/time-entries?from=$FROM&to=$TO" | jq 'length')."
