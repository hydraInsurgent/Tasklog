# Server-local time vs UTC (and why "today" is not a universal constant)

**Last updated:** 2026-05-27 - first encountered in Computed dueStatus field (#61, v2.10.3)

A server's idea of "now" and "today" depends on the timezone its process is running in, which on headless and containerized hosts is almost always UTC. That is fine for recording instants, but it quietly breaks any logic that buckets things by calendar day ("is this due today?") because the user's calendar day and the server's UTC day disagree for several hours around midnight. The rule of thumb: store instants in UTC, but compute calendar-day logic in a known local timezone.

## Mental model

A timestamp answers "what instant did this happen at" and is timezone-agnostic once you pin it to UTC. A calendar date answers "what day is it for this person", and that only has meaning relative to a timezone. "Today" is not a fact about the universe; it is a fact about a place. When code asks the operating system "what is today?", it gets the answer for the timezone the process is configured to use - not the user's timezone, unless those happen to be the same.

## Why it exists / what problem it solves

UTC is the single, offset-free reference clock that every machine can agree on, so it is the correct way to store and compare instants (created-at, logs, ordering of events). Servers default their process timezone to UTC precisely so that distributed systems do not have to reason about where each box physically sits. The problem appears the moment you mix the two ideas: you take a UTC-based "now", call `.Date` (or the equivalent) on it to get "today", and compare it against a date the user entered in their own local calendar. Near midnight those two calendars are on different days, so the comparison is wrong for a predictable window every single night.

## How it actually works

```
User in IST (UTC+5:30) at 01:24 on Wed May 27
        │
        │  the user's calendar day is:  Wed May 27
        ▼
Server process running in UTC
        │  the same instant in UTC is:  19:54 on Tue May 26
        ▼
  DateTime.Today  ->  May 26   (the UTC day, not the user's day)

  A task due "May 27" is compared against today=May 26:
     May 27 > May 26   ->  bucketed as "future", not "today"
```

The fix is to make the process compute calendar logic in the user's zone. You do not change how instants are stored (still UTC); you only change the reference used for day-of comparisons. The cleanest lever is the `TZ` environment variable, which the OS and most runtimes read to decide what "local" means. With `TZ=Asia/Kolkata`, the same instant above yields `today = May 27`, matching the user.

## Common misconceptions

- **"The server clock is wrong."** No - the instant is correct. What is "wrong" is the timezone the process interprets that instant in. The wall clock and the process can even disagree: a phone shows IST while its containerized service runs in UTC.
- **"Just use UTC everywhere and you are safe."** True for instants, false for calendar-day logic. "Due today" computed in UTC is wrong for any user not in UTC, for a few hours nightly.
- **"Storing the deadline as a date (no time) avoids timezone issues."** It avoids them in storage, but the bug reappears at comparison time, because the *other* operand ("today") is still derived from a timezone-bearing clock.
- **"It works in my tests, so it works."** Unit tests usually inject a fixed "today" or run on a developer machine whose local zone matches the test data, so they never exercise the deployed process timezone. This class of bug hides from unit tests and only shows up in a live, deployed environment.
- **"I'll just add/subtract a few hours to fix it."** Hardcoded offsets break twice a year under daylight saving and are wrong for any other zone. Use a named IANA zone (`Asia/Kolkata`), not a fixed offset.

## When it matters in practice

- A task/reminder/calendar app that buckets items into overdue / due-today / due-this-week. (Exactly the Tasklog `dueStatus` case: the proot guest ran in UTC, so a deadline of *today* was computed as *this_week* for the hours when IST and UTC were on different dates.)
- "Daily" boundaries of any kind: streaks that reset at midnight, "messages from today", daily report cutoffs, rate limits that reset per day.
- Anything that says "this week" or "this month" - the start/end of those windows is a calendar concept and inherits the same timezone dependency.
- Cron-style scheduled jobs that are supposed to run "at midnight local" but fire at midnight UTC.

## Configuration in common stacks

| Stack | "Instant, store in UTC" | "Local day, for bucketing" |
|---|---|---|
| .NET | `DateTime.UtcNow`, `DateTimeOffset.UtcNow` | `DateTime.Today` / `DateTime.Now` use the process zone; or `TimeZoneInfo.ConvertTime(...)` to an explicit zone |
| Node.js | `Date` is a UTC instant internally | `toLocaleString`/`Intl.DateTimeFormat` with an explicit `timeZone`; the process `TZ` env sets the default |
| Linux process | n/a | `TZ` env var (e.g. `TZ=Asia/Kolkata`), or `/etc/localtime`; needs the IANA tz database (`tzdata`) installed |
| systemd unit | n/a | `Environment=TZ=Asia/Kolkata` in the unit, or `timedatectl set-timezone` on the host |

Two practical notes from the field:
- **Make it testable by injecting "today".** Keep the bucket logic a pure function that takes `today` as a parameter (`ComputeDueStatus(deadline, today)`), and have the thin production caller pass `DateTime.Today`. Then tests pin any date/weekday they like without freezing the system clock, and the timezone concern lives at exactly one wiring point.
- **The tz database must be present.** Setting `TZ=Asia/Kolkata` does nothing if the host lacks `/usr/share/zoneinfo/Asia/Kolkata`; the runtime silently falls back to UTC. Verify the zone file exists in the deployed environment (containers and minimal images often omit `tzdata`).

## Further reading

- IANA Time Zone Database: https://www.iana.org/time-zones
- Microsoft .NET docs, "Choosing between DateTime, DateTimeOffset, TimeZoneInfo, and TimeZoneInfo.AdjustmentRule": https://learn.microsoft.com/en-us/dotnet/standard/datetime/choosing-between-datetime
- The `TZ` environment variable, POSIX / GNU libc manual: https://www.gnu.org/software/libc/manual/html_node/TZ-Variable.html
