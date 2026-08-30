"use client";

/* Time-tracking state shared app-wide (#77). Holds the single running entry and a `nowMs`
 * that ticks once per second ONLY while a timer is running, so the per-task control and the
 * floating bar show live elapsed without polling. The running timer is rehydrated from the
 * server on mount (so a reload keeps ticking). Starting a timer auto-stops the previous one
 * server-side; we just replace the local active entry. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TimeEntry, getActiveTimeEntry, startTimer, stopTimer, updateTimeEntry } from "@/lib/api";

// Fired on any timer start/stop (#86). Open task/time views (TasksClient, the task-detail
// time log) listen for it and refresh, so time tracked against a task reflects immediately
// instead of waiting for the 30s poll. (Pre-#86 it fired only after a quick-start created a
// task; quick-start no longer creates tasks, so start/stop is now the trigger.)
export const TASKS_CHANGED_EVENT = "tasklog:tasks-changed";

function announceTasksChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}

// What a caller can start a timer with (#86): a task, a free-text description, a project -
// any combination, all optional (a bare timer is valid, categorize it later).
export interface StartEntryInput {
  taskId?: number;
  description?: string;
  projectId?: number | null;
}

interface TimeTrackingValue {
  active: TimeEntry | null;
  // Live seconds elapsed on the active entry (0 when idle).
  elapsedSeconds: number;
  // A start/stop request is in flight (disable the controls).
  pending: boolean;
  isRunning: (taskId: number) => boolean;
  start: (taskId: number) => Promise<void>;
  // Start a timer with any combination of task / description / project (#86).
  startEntry: (input: StartEntryInput) => Promise<void>;
  // Start a task-free entry from a typed label (+ optional project). No phantom task (#86).
  quickStart: (description: string, projectId?: number | null) => Promise<void>;
  // Edit the running entry's description and/or project without stopping it (#86).
  updateActive: (fields: { description?: string | null; projectId?: number | null }) => Promise<void>;
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
  startEntry: async () => {},
  quickStart: async () => {},
  updateActive: async () => {},
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

  // Start a timer from any combination of task / description / project (#86). The server
  // auto-stops any previous timer; we just replace the local active entry.
  const startEntry = useCallback(async (input: StartEntryInput) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const body: StartEntryInput = {};
      if (input.taskId !== undefined) body.taskId = input.taskId;
      const desc = input.description?.trim();
      if (desc) body.description = desc;
      if (input.projectId != null) body.projectId = input.projectId;
      const entry = await startTimer(body);
      setActive(entry);
      setNowMs(Date.now());
      announceTasksChanged(); // refresh open task/time views
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }, []);

  const start = useCallback((taskId: number) => startEntry({ taskId }), [startEntry]);

  // Start a task-free entry from a typed label (+ optional project). No phantom Inbox task
  // is created anymore (#86) - the entry stands on its own as tracked actuals.
  const quickStart = useCallback(
    (description: string, projectId?: number | null) => startEntry({ description, projectId }),
    [startEntry],
  );

  // Edit the running entry's description/project in place (present-key), keeping it running.
  const updateActive = useCallback(
    async (fields: { description?: string | null; projectId?: number | null }) => {
      const current = active;
      if (!current) return;
      const updated = await updateTimeEntry(current.id, fields);
      setActive(updated);
    },
    [active],
  );

  const stop = useCallback(async () => {
    if (inFlight.current) return;
    const current = active;
    if (!current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await stopTimer(current.id);
      setActive(null);
      announceTasksChanged(); // refresh open task/time views
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }, [active]);

  const isRunning = useCallback((taskId: number) => active?.taskId === taskId, [active]);

  return (
    <TimeTrackingContext.Provider
      value={{ active, elapsedSeconds, pending, isRunning, start, startEntry, quickStart, updateActive, stop }}
    >
      {children}
    </TimeTrackingContext.Provider>
  );
}

export function useTimeTracking(): TimeTrackingValue {
  return useContext(TimeTrackingContext);
}
