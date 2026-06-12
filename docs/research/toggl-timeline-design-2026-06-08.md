# Toggl Track - timeline/calendar design reference (#77)

**Date:** 2026-06-08
**Purpose:** Visual + interaction reference for the time-tracking dashboard (a Toggl-style day/week timeline), captured from Toggl's own docs + screenshots.
**Sources:**
- Calendar View blog: https://toggl.com/blog/calendar-view-feature
- Tracking time in the Calendar view: https://support.toggl.com/en/articles/3924052-tracking-time-in-the-calendar-view
- Screenshots analyzed (downloaded + viewed): `image5-1024x373.png` (timer list), `image2-1024x836.png` (desktop week calendar).

> NOTE: this is a *visual* reference, not a spec we must match 1:1. We imitate the layout with our own #73 design tokens. Anything Toggl-specific that doesn't fit a single-user app is dropped.

---

## A. Desktop week calendar (the primary target) - observed from `image2`

Layout, top to bottom / left to right:

- **Toolbar:** `< >` arrows + a range label ("This week"); a "Today" reset (Toggl uses the date-picker `x` or pressing `T`); a list/calendar view toggle top-right.
- **Day columns:** one column per day with a header `SUN 08-09 / MON 08-10 / ...`. Toggl shows a 7-day week (also offers 5-day hiding weekends, and single-day). **Today's column is tinted** a slightly different background.
- **Hour axis (left gutter):** vertical hour labels `5:00 AM, 6:00 AM, 7:00 AM ...` in muted gray, one row per hour (1-hour gridlines). The grid scrolls vertically across 00:00-23:00; it opens scrolled to the working hours, not 00:00.
- **Time-entry blocks:** a colored rectangle positioned by start time, **height proportional to duration**. Each block shows:
  - the entry **description** (bold, dark text),
  - the **project** as a small colored dot + name,
  - the **start-end time** ("4:40 AM - 5:35 AM") - shown in day-view; hidden on very short blocks.
  - Fill is a **pastel/translucent project color** with a **saturated left edge** in the same hue. Overlapping/adjacent entries sit side by side within the column.
- **"Now" line:** a thin **red horizontal line** across today's column at the current time.

## B. Timer list view - observed from `image5`

- A big **green circular play button** (FAB, top-right) - the primary start control. (We already have a similar primary accent.)
- Each row: **description** + **project color dot** + project name + **start-end time** + **duration** (right-aligned, e.g. "02:02:00", "5 sec", "19:30 min").
- This is our fallback/secondary representation (a plain entry list) and the styling for durations.

## C. Mobile single-day (from Toggl docs + user's description)

- **One day column**, full width, same vertical hour axis + colored blocks.
- **Navigation:** left/right arrows to step days, a date button to jump to any date that has entries.
- **Create:** long-press an empty slot to create an entry; tap-drag to set duration; **handles** at top/bottom of a block to resize; tap-hold + move to reschedule.
- Bottom nav has a calendar icon to enter this view.

## D. Interactions Toggl supports (we choose a subset)

- **Create:** click/long-press an empty slot -> new entry; drag to set duration (10-min increments at high zoom, 5-min otherwise).
- **Resize:** drag a block's top/bottom handle to change start/end.
- **Move:** drag a block to another time or day.
- **Edit:** click a block to open its detail (description, project, times) -> save/delete.
- **Color = project color.**

## E. Mapping to our app

- **Colors:** Toggl colors blocks by **project color**, which our projects DON'T have (only Labels have a `colorIndex`/VIBGYOR palette). Options for our block color (DECISION - see explore Round 2): (a) add a color to Projects, (b) color by the task's first label, (c) deterministic hash of project/task id -> a fixed palette. Inbox/no-project needs a default.
- **Tokens:** axis lines = `--color-border`/`border-muted`; today tint = `--color-surface-raised`; now-line = `--color-danger`; text = `--color-text-primary`/`text-muted`; block hues from whichever color source we pick (kept pastel via opacity, saturated left edge).
- **Play control:** reuse the primary/accent for the per-task play button; a green "stop" matching the habit check-in green (`--color-success`/green-600) for the running state.
- **No drag library:** Toggl's drag-create/resize/move is heavy. Our v1 can be **click/tap-to-add (form) + click-to-edit/delete**, with drag-resize/move as a later enhancement (DECISION - Round 2).
- **Stack:** Next.js + Tailwind tokens; durations/positions are pure math (top = minutesFromMidnight, height = durationMinutes, scaled by a px-per-minute constant). No chart lib needed - the timeline is absolutely-positioned blocks in an hour grid.

## F. What we drop (Business/Toggl features not relevant)

GPS/location, attendance day clock-in/out, consent, teams/managers, automatic background activity recording ("Timeline" pills), zoom levels, integrations.
