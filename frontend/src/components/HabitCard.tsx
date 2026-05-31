"use client";

import { Flame, Check, Loader2, Repeat } from "lucide-react";
import { Habit } from "@/lib/api";
import { lastNDays, describeRecurrence } from "@/lib/format";
import { occursOn, nextDueOnOrAfter } from "@/lib/recurrence";

interface Props {
  habit: Habit;
  // Toggle today's check-in. The parent owns the optimistic update + API call.
  onToggle: (habit: Habit) => void;
  // True while this habit's check-in request is in flight (disables the toggle).
  pending: boolean;
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Frequency week-cell colours: green (target met), yellow (showed up, under target),
// grey (nothing). Maps to the semantic tokens from #73.
const WEEK_CELL_CLASS: Record<string, string> = {
  met: "bg-success",
  partial: "bg-warning",
  none: "bg-border",
};

export default function HabitCard({ habit, onToggle, pending }: Props) {
  const { task, currentStreak, doneToday } = habit;

  // Frequency habit ("x times a week", #75): a different card - weekly progress + a coloured
  // week strip + a WEEK-based streak - instead of the scheduled-day dot row. A frequency
  // habit has no fixed days, so it is checkable every day (no "not due today").
  if (task.weeklyTarget != null) {
    const target = task.weeklyTarget;
    const thisWeek = habit.thisWeekCount ?? 0;
    const weeks = habit.recentWeeks ?? [];
    const weekStreakLabel =
      currentStreak === 0 ? "No streak yet" : `${currentStreak} week${currentStreak === 1 ? "" : "s"}`;
    return (
      <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-4">
        {/* Title + week streak */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-text-primary min-w-0 break-words">{task.title}</h2>
          <div className="flex items-center gap-1.5 shrink-0" title={`${weekStreakLabel} streak`}>
            <Flame size={18} aria-hidden="true" className={currentStreak > 0 ? "text-amber-500" : "text-zinc-300"} />
            <span className={`text-sm font-medium tabular-nums ${currentStreak > 0 ? "text-text-primary" : "text-text-muted"}`}>
              {weekStreakLabel}
            </span>
          </div>
        </div>

        <p className="-mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <Repeat size={12} aria-hidden="true" />
          {target}x per week
        </p>

        {/* This-week progress + recent-week strip (oldest left, current week ringed). */}
        <div>
          <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
            <span>This week</span>
            <span className="tabular-nums font-medium text-text-primary">
              {thisWeek}/{target}
            </span>
          </div>
          <div className="flex items-stretch gap-1.5" aria-label="Recent weeks">
            {weeks.map((w, i) => (
              <span
                key={w.weekStart}
                title={`Week of ${w.weekStart}: ${w.count}/${target}`}
                className={`flex-1 h-5 rounded ${WEEK_CELL_CLASS[w.status] ?? "bg-border"} ${
                  i === weeks.length - 1 ? "ring-2 ring-accent ring-offset-1" : ""
                }`}
              />
            ))}
          </div>
        </div>

        {/* Check-in toggle - available any day for a frequency habit. */}
        <button
          type="button"
          onClick={() => onToggle(habit)}
          disabled={pending}
          aria-pressed={doneToday}
          className={`flex items-center justify-center gap-2 w-full px-4 py-2 min-h-[44px] text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer ${
            doneToday
              ? "bg-green-600 text-white hover:bg-green-700 focus:ring-green-600"
              : "bg-primary text-white hover:bg-primary-hover focus:ring-accent"
          }`}
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : doneToday ? (
            <Check size={16} aria-hidden="true" />
          ) : null}
          {doneToday ? "Done today" : "Check in today"}
        </button>
      </div>
    );
  }

  const days = lastNDays(habit.recentCheckIns, 7);
  // A habit's recurrence is its schedule ("every Tue & Thu"); the streak respects it.
  const schedule = task.recurrence ? describeRecurrence(task.recurrence) : null;

  // Whether the habit is "due" today (per its schedule). A check-in is only offered on
  // a scheduled day; off-days show when it's next due instead of a no-op button.
  const today = new Date();
  const dueToday = occursOn(task.recurrence, today);
  const next = dueToday ? null : nextDueOnOrAfter(task.recurrence, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  const streakLabel =
    currentStreak === 0 ? "No streak yet" : `${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-4">
      {/* Title + streak */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary min-w-0 break-words">{task.title}</h2>
        <div className="flex items-center gap-1.5 shrink-0" title={`${streakLabel} streak`}>
          <Flame size={18} aria-hidden="true" className={currentStreak > 0 ? "text-amber-500" : "text-zinc-300"} />
          <span className={`text-sm font-medium tabular-nums ${currentStreak > 0 ? "text-text-primary" : "text-text-muted"}`}>
            {streakLabel}
          </span>
        </div>
      </div>

      {/* Schedule (the habit's recurrence), if any. */}
      {schedule && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <Repeat size={12} aria-hidden="true" />
          {schedule}
        </p>
      )}

      {/* Last 7 days. Only SCHEDULED days get a real dot (filled = done); non-scheduled
          days are recessed - so a "Fri & Sat" habit shows 2 dots of 7, making the
          pattern obvious. A daily habit shows all 7. */}
      <div className="flex items-end gap-2" aria-label="Recent activity">
        {days.map((day) => {
          const dObj = new Date(day.date + "T00:00:00");
          const scheduled = occursOn(task.recurrence, dObj);
          const weekday = WEEKDAY_INITIALS[dObj.getDay()];
          return (
            <div key={day.date} className="flex flex-col items-center gap-1">
              {scheduled ? (
                <span
                  className={`w-5 h-5 rounded-full ${day.done ? "bg-primary" : "bg-border"} ${
                    day.isToday ? "ring-2 ring-accent ring-offset-1" : ""
                  }`}
                  aria-label={`${day.date}${day.done ? " (done)" : ""}`}
                />
              ) : (
                <span className="w-5 h-5 flex items-center justify-center" aria-hidden="true">
                  <span className="w-1 h-1 rounded-full bg-border" />
                </span>
              )}
              <span className={`text-[10px] leading-none ${scheduled ? "text-text-muted" : "text-border"}`}>{weekday}</span>
            </div>
          );
        })}
      </div>

      {/* Done-today toggle - only on a scheduled day; otherwise show when it's next due. */}
      {dueToday ? (
        <button
          type="button"
          onClick={() => onToggle(habit)}
          disabled={pending}
          aria-pressed={doneToday}
          className={`flex items-center justify-center gap-2 w-full px-4 py-2 min-h-[44px] text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer ${
            doneToday
              ? "bg-green-600 text-white hover:bg-green-700 focus:ring-green-600"
              : "bg-primary text-white hover:bg-primary-hover focus:ring-accent"
          }`}
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : doneToday ? (
            <Check size={16} aria-hidden="true" />
          ) : null}
          {doneToday ? "Done today" : "Mark done today"}
        </button>
      ) : (
        <div className="w-full px-4 py-2 min-h-[44px] flex items-center justify-center text-sm text-text-muted bg-surface-raised rounded-md">
          Not due today{next ? ` · next ${WEEKDAY_SHORT[next.getDay()]}` : ""}
        </div>
      )}
    </div>
  );
}
