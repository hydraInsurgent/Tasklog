"use client";

/* Time-tracking state shared app-wide (#77). Holds the single running entry and a `nowMs`
 * that ticks once per second ONLY while a timer is running, so the per-task control and the
 * floating bar show live elapsed without polling. The running timer is rehydrated from the
 * server on mount (so a reload keeps ticking). Starting a timer auto-stops the previous one
 * server-side; we just replace the local active entry. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TimeEntry, createTask, getActiveTimeEntry, startTimer, stopTimer } from "@/lib/api";

// Fired after quickStart creates a task so the task list (TasksClient) refetches and the
// new task shows immediately, instead of waiting for the 30s poll.
export const TASKS_CHANGED_EVENT = "tasklog:tasks-changed";

interface TimeTrackingValue {
  active: TimeEntry | null;
  // Live seconds elapsed on the active entry (0 when idle).
  elapsedSeconds: number;
  // A start/stop request is in flight (disable the controls).
  pending: boolean;
  isRunning: (taskId: number) => boolean;
  start: (taskId: number) => Promise<void>;
  // Quick-create an Inbox task from a typed title and immediately start tracking it (#77).
  quickStart: (title: string) => Promise<void>;
  stop: () => Promise<void>;
}

// A no-op default so a component rendered outside the provider (e.g. in isolated unit tests)
// degrades to an idle, inert control rather than throwing. The provider is mounted at the
// app root in production, so real usage always gets the live value.
const NOOP: TimeTrackingValue = {
  active: null,
  elapsedSeconds: 0,
  pending: false,
  isRunning: () => false,
  start: async () => {},
  quickStart: async () => {},
  stop: async () => {},
};

const TimeTrackingContext = createContext<TimeTrackingValue>(NOOP);

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [pending, setPending] = useState(false);

  // Rehydrate the running timer on mount.
  useEffect(() => {
    getActiveTimeEntry()
      .then((e) => {
        if (e) {
          setActive(e);
          setNowMs(Date.now());
        }
      })
      .catch(() => {
        /* no timer / API down - stay idle */
      });
  }, []);

  // Tick once a second, but only while something is running.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // A local ISO datetime ("...T..." with no zone) parses as local time, matching the
  // server's local-time storage, so the elapsed delta is correct.
  const elapsedSeconds = active
    ? Math.max(0, Math.floor((nowMs - new Date(active.startedAt).getTime()) / 1000))
    : 0;

  // Guard against overlapping start/stop clicks.
  const inFlight = useRef(false);

  const start = useCallback(async (taskId: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const entry = await startTimer(taskId); // server auto-stops any previous timer
      setActive(entry);
      setNowMs(Date.now());
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }, []);

  // Quick-create a task (Inbox) from a title and start its timer in one step. The created
  // task behaves like any other - it shows in the list and accrues sessions like normal.
  const quickStart = useCallback(async (title: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const task = await createTask(title.trim() || "Untitled");
      const entry = await startTimer(task.id); // server auto-stops any previous timer
      setActive(entry);
      setNowMs(Date.now());
      if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }, []);

  const stop = useCallback(async () => {
    if (inFlight.current) return;
    const current = active;
    if (!current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await stopTimer(current.id);
      setActive(null);
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }, [active]);

  const isRunning = useCallback((taskId: number) => active?.taskId === taskId, [active]);

  return (
    <TimeTrackingContext.Provider
      value={{ active, elapsedSeconds, pending, isRunning, start, quickStart, stop }}
    >
      {children}
    </TimeTrackingContext.Provider>
  );
}

export function useTimeTracking(): TimeTrackingValue {
  return useContext(TimeTrackingContext);
}
