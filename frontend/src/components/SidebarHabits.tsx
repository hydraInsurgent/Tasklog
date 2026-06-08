"use client";

/* Compact habits section for the left sidebar, below "Add project" (#76 feedback).
 * Replaces the cramped right-side panel. Shows only habits DUE TODAY - a not-due habit
 * is hidden here (the full /habits view via "View all" still shows everything) - each as a
 * one-tap check-in row. State + the check-in toggle are owned by ProjectLayout and shared
 * with the inline task-list habit rows, so everything stays in sync. */

import Link from "next/link";
import { Flame } from "lucide-react";
import { Habit } from "@/lib/api";
import { occursOn } from "@/lib/recurrence";
import TaskDoneControl from "./TaskDoneControl";

interface Props {
  habits: Habit[];
  pendingCheckIns: Set<number>;
  onCheckInToggle: (taskId: number) => void;
}

const noop = () => {};

export default function SidebarHabits({ habits, pendingCheckIns, onCheckInToggle }: Props) {
  if (habits.length === 0) return null;
  const today = new Date();
  const dueToday = habits.filter((h) => occursOn(h.task.recurrence, today));

  return (
    <div className="mt-3 px-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
          <Flame size={14} className="text-amber-500" aria-hidden="true" />
          Habits
        </h2>
        <Link
          href="/habits"
          className="text-xs text-text-muted hover:text-text-primary focus:outline-none focus:underline"
        >
          View all
        </Link>
      </div>

      {dueToday.length === 0 ? (
        <p className="py-1 text-xs text-text-muted">Nothing due today.</p>
      ) : (
        <ul className="flex flex-col">
          {dueToday.map((h) => {
            // A frequency habit isn't really a yes/no for the day - show its weekly
            // progress (e.g. "1/4") instead of leaning on the check-in circle alone (#76).
            const isFrequency = h.task.weeklyTarget != null;
            const count = h.thisWeekCount ?? 0;
            const target = h.task.weeklyTarget ?? 0;
            const progressColor =
              count === 0 ? "text-text-muted" : count >= target ? "text-success" : "text-warning";
            return (
              <li key={h.task.id} className="flex items-center gap-2 py-1.5">
                <TaskDoneControl
                  task={h.task}
                  habit={h}
                  pendingCheckIn={pendingCheckIns.has(h.task.id)}
                  onComplete={noop}
                  onCheckInToggle={onCheckInToggle}
                />
                <span className="flex-1 truncate text-sm text-text-primary" title={h.task.title}>
                  {h.task.title}
                </span>
                {isFrequency && (
                  <span
                    className={`shrink-0 text-xs font-medium tabular-nums ${progressColor}`}
                    title={`${count} of ${target} this week`}
                  >
                    {count}/{target}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
