"use client";

import { useState, useEffect, useCallback } from "react";
import { usePolling } from "@/hooks/usePolling";
import { CheckCircle, XCircle, Loader2, Flame } from "lucide-react";
import { getHabits, addCheckIn, removeCheckIn, Habit } from "@/lib/api";
import HabitCard from "./HabitCard";

type Feedback = { type: "success" | "error"; message: string } | null;

// Local "YYYY-MM-DD" for today, matching the server's local-day check-in dates.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HabitsClient() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Task ids with a check-in toggle in flight (disables that card's button).
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  // Fetch habits on mount.
  useEffect(() => {
    async function load() {
      try {
        setHabits(await getHabits());
      } catch {
        showFeedback("error", "Failed to load habits. Is the API running?");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Background refresh every 30s, paused while a toggle is in flight so the
  // optimistic state isn't clobbered mid-request.
  usePolling(
    useCallback(async () => {
      setHabits(await getHabits());
    }, []),
    30000,
    pendingIds.size === 0,
  );

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  // Toggle today's check-in for a habit, optimistically. Marking done bumps the
  // streak by one and fills today's dot; undoing reverses both. The streak delta
  // is always +/-1: the server counts consecutive days back from today (grace
  // through yesterday), so adding/removing today shifts the run by exactly one.
  async function handleToggle(habit: Habit) {
    const id = habit.task.id;
    if (pendingIds.has(id)) return;
    const key = todayKey();
    const markingDone = !habit.doneToday;

    // Optimistic update.
    setHabits((prev) =>
      prev.map((h) =>
        h.task.id === id
          ? {
              ...h,
              doneToday: markingDone,
              currentStreak: Math.max(0, h.currentStreak + (markingDone ? 1 : -1)),
              recentCheckIns: markingDone
                ? [key, ...h.recentCheckIns]
                : h.recentCheckIns.filter((d) => d.slice(0, 10) !== key),
            }
          : h,
      ),
    );
    setPendingIds((prev) => new Set(prev).add(id));

    try {
      if (markingDone) await addCheckIn(id);
      else await removeCheckIn(id);
    } catch {
      // Revert to the canonical server state on failure.
      showFeedback("error", "Couldn't update the check-in. Refreshing...");
      try {
        setHabits(await getHabits());
      } catch {
        /* leave the optimistic state if the refetch also fails */
      }
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="alert"
          className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle size={16} aria-hidden="true" />
          ) : (
            <XCircle size={16} aria-hidden="true" />
          )}
          {feedback.message}
        </div>
      )}

      <div>
        <h1
          className="text-lg font-semibold text-text-primary"
          style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          Habits
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Check in each day to build a streak. Mark any task a habit from its edit dialog.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          <span>Loading habits...</span>
        </div>
      ) : habits.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 px-6 text-center">
          <Flame size={28} className="mx-auto text-zinc-300" aria-hidden="true" />
          <p className="mt-3 text-sm text-text-muted">
            No habits yet. Tick &ldquo;Track as a daily habit&rdquo; when adding or editing a task.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((habit) => (
            <HabitCard
              key={habit.task.id}
              habit={habit}
              onToggle={handleToggle}
              pending={pendingIds.has(habit.task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
