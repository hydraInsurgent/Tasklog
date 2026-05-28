"use client";

import { Flame, Check, Loader2 } from "lucide-react";
import { Habit } from "@/lib/api";
import { lastNDays } from "@/lib/format";

interface Props {
  habit: Habit;
  // Toggle today's check-in. The parent owns the optimistic update + API call.
  onToggle: (habit: Habit) => void;
  // True while this habit's check-in request is in flight (disables the toggle).
  pending: boolean;
}

// Short weekday initial (M T W ...) for the dot row labels, derived from the date.
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export default function HabitCard({ habit, onToggle, pending }: Props) {
  const { task, currentStreak, doneToday } = habit;
  const days = lastNDays(habit.recentCheckIns, 7);

  const streakLabel =
    currentStreak === 0
      ? "No streak yet"
      : `${currentStreak} day${currentStreak === 1 ? "" : "s"}`;

  return (
    <div className="bg-white border border-border rounded-lg p-5 flex flex-col gap-4">
      {/* Title + streak */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary min-w-0 break-words">
          {task.title}
        </h2>
        <div
          className="flex items-center gap-1.5 shrink-0"
          title={`${streakLabel} streak`}
        >
          <Flame
            size={18}
            aria-hidden="true"
            className={currentStreak > 0 ? "text-amber-500" : "text-zinc-300"}
          />
          <span
            className={`text-sm font-medium tabular-nums ${
              currentStreak > 0 ? "text-text-primary" : "text-text-muted"
            }`}
          >
            {streakLabel}
          </span>
        </div>
      </div>

      {/* Last 7 days dot row */}
      <div className="flex items-end gap-2" aria-label="Last 7 days">
        {days.map((day) => {
          const weekday = WEEKDAY_INITIALS[new Date(day.date + "T00:00:00").getDay()];
          return (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span
                className={`w-5 h-5 rounded-full ${
                  day.done ? "bg-primary" : "bg-border"
                } ${day.isToday ? "ring-2 ring-accent ring-offset-1" : ""}`}
                aria-label={`${day.date}${day.done ? " (done)" : ""}`}
              />
              <span className="text-[10px] text-text-muted leading-none">{weekday}</span>
            </div>
          );
        })}
      </div>

      {/* Done-today toggle */}
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
    </div>
  );
}
