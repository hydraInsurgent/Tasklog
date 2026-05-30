"use client";

/* The "done" control for a task row/card (#73 Habits v2). Centralizes the rule that a
 * HABIT is never completed/closed - it is checked in for the day - while a normal task
 * uses the usual complete checkbox. One component so the list, the mobile card, and the
 * board card all behave identically.
 *
 * - Normal task: a checkbox toggling completion.
 * - Habit: an amber ring that fills green when today is checked in. Clicking toggles the
 *   day's check-in (never closes the task). The amber ring also visually distinguishes a
 *   habit from a normal task at a glance. */

import { Check, Loader2 } from "lucide-react";
import { Task, Habit } from "@/lib/api";
import { occursOn } from "@/lib/recurrence";

interface Props {
  task: Task;
  // Present iff this task is a habit (supplies doneToday). When a task isHabit but no
  // habit record is loaded yet, we still treat it as a habit (check-in control, not done).
  habit?: Habit;
  completing?: boolean; // a normal complete request is in flight
  pendingCheckIn?: boolean; // a habit check-in request is in flight
  onComplete: (id: number, isCompleted: boolean) => void;
  onCheckInToggle: (id: number) => void;
}

export default function TaskDoneControl({ task, habit, completing, pendingCheckIn, onComplete, onCheckInToggle }: Props) {
  if (task.isHabit) {
    const done = habit?.doneToday ?? false;
    // A scheduled habit is only checkable on a scheduled day; off-days show a dashed,
    // non-interactive ring so it's clear the habit exists but isn't due now.
    if (!occursOn(task.recurrence, new Date())) {
      return (
        <span
          title="Not due today"
          aria-label={`${task.title} is not due today`}
          className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-dashed border-border shrink-0"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCheckInToggle(task.id);
        }}
        disabled={pendingCheckIn}
        aria-pressed={done}
        aria-label={done ? `Undo today's check-in for ${task.title}` : `Check in ${task.title} for today`}
        title={done ? "Checked in today" : "Check in for today"}
        className={`flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          done ? "bg-success border-success text-white" : "border-amber-500 text-transparent hover:bg-warning-bg"
        }`}
      >
        {pendingCheckIn ? (
          <Loader2 size={11} className="animate-spin text-amber-500" aria-hidden="true" />
        ) : done ? (
          <Check size={12} aria-hidden="true" />
        ) : null}
      </button>
    );
  }

  return (
    <input
      type="checkbox"
      checked={task.isCompleted}
      onChange={(e) => onComplete(task.id, e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      disabled={completing}
      aria-label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
      className="w-4 h-4 rounded border-border text-text-primary focus:ring-accent disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
    />
  );
}
