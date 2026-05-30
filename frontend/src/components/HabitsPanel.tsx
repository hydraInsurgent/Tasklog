"use client";

/* Right-side Habits panel beside the task list (#73 Habits v2). Lets you check in
 * daily without leaving the tasks view. Presentational - habit state + the check-in
 * toggle are owned by ProjectLayout and shared with the inline habit rows, so the
 * panel and the list always agree. Desktop-only (rendered under lg: by the parent);
 * the full /habits page remains for mobile + a fuller view. */

import { Flame } from "lucide-react";
import Link from "next/link";
import { Habit } from "@/lib/api";
import HabitCard from "./HabitCard";

interface Props {
  habits: Habit[];
  pendingCheckIns: Set<number>;
  onCheckInToggle: (taskId: number) => void;
}

export default function HabitsPanel({ habits, pendingCheckIns, onCheckInToggle }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-text-primary">
          <Flame size={16} className="text-amber-500" aria-hidden="true" />
          Habits
        </h2>
        <Link
          href="/habits"
          className="text-xs text-text-muted hover:text-text-primary focus:outline-none focus:underline"
        >
          View all
        </Link>
      </div>

      {habits.map((habit) => (
        <HabitCard
          key={habit.task.id}
          habit={habit}
          onToggle={(h) => onCheckInToggle(h.task.id)}
          pending={pendingCheckIns.has(habit.task.id)}
        />
      ))}
    </div>
  );
}
