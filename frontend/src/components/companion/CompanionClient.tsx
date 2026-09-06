"use client";

// Sage - the companion surface (#87). One conversation per day: a message
// stream, a sticky composer, and inline proposal cards (the trust loop:
// keep / edit / toss). A history calendar (desktop right rail / mobile
// toggle) browses past days read-only - dots mark days with conversations,
// exactly like the journal's calendar. Talks to two backends:
//
//   - /api/companion/chat (same-origin Next.js route): runs one AI turn and
//     streams NDJSON events (text_delta / card / done / error).
//   - the .NET API (via lib/api.ts): session + captures persistence.
//
// Degradability contract: the route saves the user's words BEFORE the AI runs,
// so a mid-turn failure shows a soft notice and loses nothing. Only a transport
// failure (this fetch never reached the route) means unsaved - the composer
// keeps the draft in that case and says so.
//
// Past days are read-only as CONVERSATIONS (no composer), but their proposal
// cards stay fully actionable: the talk is day-bound, the inbox is not.

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import {
  confirmCapture,
  dismissCapture,
  getCaptures,
  getCompanionSessionByDate,
  getCompanionSessionDates,
  getProjects,
  getTodayCompanionSession,
  restoreCapture,
  updateCapture,
  type CaptureDto,
  type CompanionMessage,
  type Project,
} from "@/lib/api";
import { dateKey } from "@/lib/time";
import {
  COMPANION_GREETING,
  COMPANION_NAME,
  STARTER_CHIPS,
} from "@/lib/companion/meta";
import CompanionCalendar from "./CompanionCalendar";

// ---------- small shared bits ----------

// Soft SVG sprout glyph - Sage's avatar (no emoji per UX rules).
function SageGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 21v-8M12 13c0-4 2.5-6.5 7-7-.5 4.5-3 7-7 7ZM12 13c0-3-2-5-5.5-5.5.4 3.5 2.5 5.5 5.5 5.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Local wall-clock ISO, no timezone suffix (codebase convention; the route
// stores the same shape). toISOString would write UTC and lie by hours.
function localIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// NDJSON events from the chat route (mirrors provider.ts CompanionTurnEvent).
type TurnEvent =
  | { type: "text_delta"; text: string }
  | { type: "card"; capture: CaptureDto }
  | { type: "done"; sdkSessionId: string | null; text: string; sessionId?: number }
  | { type: "error"; message: string };

// The stream interleaves messages and cards by time (cards appear where they
// were proposed, and stay after resolution as the trust-loop record).
type TimelineItem =
  | { kind: "msg"; at: string; msg: CompanionMessage }
  | { kind: "card"; at: string; capture: CaptureDto };

// Month window for the calendar-dots fetch.
function monthRange(anchor: Date): { from: string; to: string } {
  return {
    from: dateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
    to: dateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)),
  };
}

// ---------- proposal card ----------

function ProposalCard({
  capture,
  projects,
  onKeep,
  onToss,
  onRestore,
  onSaveEdit,
}: {
  capture: CaptureDto;
  projects: Project[];
  onKeep: (id: number) => Promise<void>;
  onToss: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onSaveEdit: (id: number, payload: CaptureDto["payload"]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(capture.payload.title ?? "");
  const [projectId, setProjectId] = useState<number | "">(
    capture.payload.projectId ?? "",
  );
  const [newProj, setNewProj] = useState(capture.payload.newProjectName ?? "");
  const [busy, setBusy] = useState<"keep" | "toss" | "save" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolved = capture.status !== "proposed";
  const project = projects.find(
    (p) => p.id === (editing ? projectId : capture.payload.projectId),
  );

  // Sage can update a proposed card mid-conversation (update_capture): sync the
  // edit fields from the fresh payload so opening Edit never shows stale values.
  const startEdit = () => {
    setTitle(capture.payload.title ?? "");
    setProjectId(capture.payload.projectId ?? "");
    setNewProj(capture.payload.newProjectName ?? "");
    setEditing(true);
  };

  const run = async (
    action: "keep" | "toss" | "save" | "restore",
    fn: () => Promise<void>,
  ) => {
    setBusy(action);
    setError(null);
    try {
      await fn();
      if (action === "save") setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong - retry.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`rounded-2xl border bg-c-card px-4 py-3 transition-opacity duration-200 ${
        resolved ? "opacity-60 border-c-line" : "border-c-accent/40"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-c-muted mb-1">
        {COMPANION_NAME} suggests a task
      </p>

      {editing ? (
        <div className="space-y-2">
          <div>
            <label htmlFor={`cap-title-${capture.id}`} className="block text-xs text-c-muted mb-1">
              Title
            </label>
            <input
              id={`cap-title-${capture.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-c-line bg-c-bg px-3 py-2 text-base text-c-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            />
          </div>
          {capture.payload.newProjectName !== undefined && (
            <div>
              <label htmlFor={`cap-newproj-${capture.id}`} className="block text-xs text-c-muted mb-1">
                New project (clear to use the dropdown instead)
              </label>
              <input
                id={`cap-newproj-${capture.id}`}
                value={newProj}
                onChange={(e) => setNewProj(e.target.value)}
                className="w-full rounded-lg border border-c-line bg-c-bg px-3 py-2 text-base text-c-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              />
            </div>
          )}
          <div>
            <label htmlFor={`cap-project-${capture.id}`} className="block text-xs text-c-muted mb-1">
              Project
            </label>
            <select
              id={`cap-project-${capture.id}`}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={newProj.trim() !== ""}
              className="w-full rounded-lg border border-c-line bg-c-bg px-3 py-2 text-base text-c-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent disabled:opacity-50"
            >
              <option value="">Inbox (no project)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.client ? ` - ${p.client.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy !== null || title.trim() === ""}
              onClick={() =>
                run("save", () =>
                  // A typed new-project name wins; otherwise the dropdown choice
                  // applies and any stale newProjectName is dropped.
                  onSaveEdit(capture.id, {
                    ...capture.payload,
                    title: title.trim(),
                    ...(newProj.trim() !== ""
                      ? { newProjectName: newProj.trim(), projectId: undefined }
                      : {
                          newProjectName: undefined,
                          ...(projectId === "" ? { projectId: undefined } : { projectId }),
                        }),
                  }),
                )
              }
              className="min-h-11 px-4 rounded-lg bg-c-accent text-white text-sm font-medium disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            >
              {busy === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setEditing(false)}
              className="min-h-11 px-4 rounded-lg border border-c-line text-sm text-c-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-base font-medium text-c-ink">{capture.payload.title}</p>
          <p className="text-sm text-c-muted mt-0.5">
            {capture.payload.newProjectName ? (
              <>
                {capture.payload.newProjectName}{" "}
                <span className="text-c-accent">· new project</span>
              </>
            ) : project ? (
              project.name
            ) : (
              "Inbox"
            )}
            {capture.payload.deadline ? ` · due ${capture.payload.deadline.slice(0, 10)}` : ""}
          </p>
          {capture.span && (
            <p className="text-xs text-c-muted italic mt-1.5 line-clamp-2">
              &ldquo;{capture.span}&rdquo;
            </p>
          )}

          {resolved ? (
            // Resolved state: icon + word + color (never color alone).
            <p
              className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${
                capture.status === "confirmed" ? "text-success" : "text-c-muted"
              }`}
            >
              {capture.status === "confirmed" ? (
                <>
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
                    <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Added to your tasks
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Dismissed
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run("restore", () => onRestore(capture.id))}
                    className="ml-1 min-h-11 px-3 rounded-lg border border-c-line text-sm text-c-ink cursor-pointer hover:bg-c-accent-soft transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                  >
                    {busy === "restore" ? "..." : "Restore"}
                  </button>
                </>
              )}
            </p>
          ) : (
            <div className="flex gap-2 mt-2.5">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("keep", () => onKeep(capture.id))}
                className="min-h-11 px-4 rounded-lg bg-c-accent text-white text-sm font-medium disabled:opacity-50 cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                {busy === "keep" ? "Adding..." : "Keep"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={startEdit}
                className="min-h-11 px-4 rounded-lg border border-c-line text-sm text-c-ink cursor-pointer transition-colors duration-150 hover:bg-c-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("toss", () => onToss(capture.id))}
                className="min-h-11 px-4 rounded-lg text-sm text-c-muted cursor-pointer transition-colors duration-150 hover:bg-c-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                {busy === "toss" ? "..." : "Toss"}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger mt-2">{error}</p>}
    </div>
  );
}

// ---------- cards panel (rail / drawer) ----------

// Always-in-reach card triage (#87): proposed cards scroll away inside the
// conversation, so the rail/drawer mirrors them for deciding without scrolling.
// Same captures state as the inline cards - two views, one truth. Tossed cards
// keep a Restore here for the mis-tap case; kept ones just count.
function CardsPanel({
  captures,
  projects,
  onKeep,
  onToss,
  onRestore,
}: {
  captures: CaptureDto[];
  projects: Project[];
  onKeep: (id: number) => Promise<void>;
  onToss: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const pending = captures.filter((c) => c.status === "proposed");
  const tossed = captures.filter((c) => c.status === "dismissed");
  const keptCount = captures.filter((c) => c.status === "confirmed").length;

  const act = async (id: number, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } catch {
      // the inline card surfaces errors; the panel stays quiet
    } finally {
      setBusyId(null);
    }
  };

  const projectLine = (c: CaptureDto) =>
    c.payload.newProjectName
      ? `${c.payload.newProjectName} · new`
      : projects.find((p) => p.id === c.payload.projectId)?.name ?? "Inbox";

  return (
    <div className="rounded-2xl border border-c-line bg-c-card p-3">
      <p className="text-sm font-medium text-c-ink mb-2">
        Cards
        <span className="text-c-muted font-normal">
          {" "}· {pending.length} pending
          {keptCount > 0 ? ` · ${keptCount} kept` : ""}
        </span>
      </p>

      {pending.length === 0 && tossed.length === 0 && (
        <p className="text-xs text-c-muted">Nothing suggested yet today.</p>
      )}

      <ul className="space-y-2">
        {pending.map((c) => (
          <li key={c.id} className="rounded-xl border border-c-accent/40 bg-c-bg px-3 py-2">
            <p className="text-sm text-c-ink leading-snug">{c.payload.title}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-c-muted truncate">{projectLine(c)}</span>
              <span className="flex gap-1 shrink-0">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => act(c.id, () => onKeep(c.id))}
                  aria-label={`Keep "${c.payload.title}"`}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-c-accent text-white disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                >
                  <Check size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => act(c.id, () => onToss(c.id))}
                  aria-label={`Toss "${c.payload.title}"`}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-c-line text-c-muted hover:bg-c-accent-soft disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </span>
            </div>
          </li>
        ))}

        {tossed.map((c) => (
          <li key={c.id} className="rounded-xl border border-c-line bg-c-bg px-3 py-2 opacity-70">
            <p className="text-sm text-c-ink leading-snug line-through decoration-c-muted/60">
              {c.payload.title}
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-c-muted">tossed</span>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => act(c.id, () => onRestore(c.id))}
                className="min-h-11 px-3 rounded-lg border border-c-line text-xs text-c-ink hover:bg-c-accent-soft disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                Restore
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- the surface ----------

export default function CompanionClient() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [captures, setCaptures] = useState<CaptureDto[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Two distinct failure copies (see header comment): saved vs not-saved.
  const [turnError, setTurnError] = useState<"ai" | "transport" | null>(null);

  // History browsing (#87 calendar): which day is on screen. Today = live.
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [sessionDates, setSessionDates] = useState<Set<string>>(new Set());
  const [showCalendar, setShowCalendar] = useState(false); // mobile toggle
  const isToday = dateKey(selectedDate) === dateKey(new Date());

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Load the selected day's conversation (today = the live session).
  const loadDay = useCallback(async (day: Date) => {
    const key = dateKey(day);
    const session =
      key === dateKey(new Date())
        ? await getTodayCompanionSession()
        : await getCompanionSessionByDate(key);
    if (session) {
      setSessionId(session.id);
      setMessages(Array.isArray(session.messages) ? session.messages : []);
      setCaptures(await getCaptures(session.id));
    } else {
      setSessionId(null);
      setMessages([]);
      setCaptures([]);
    }
  }, []);

  // Mount: projects + today's conversation + this month's calendar dots.
  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const { from, to } = monthRange(now);
        const [projectList, dates] = await Promise.all([
          getProjects(),
          getCompanionSessionDates(from, to),
        ]);
        setProjects(projectList);
        setSessionDates(new Set(dates));
        await loadDay(now);
      } catch {
        setLoadError(true);
      }
    })();
  }, [loadDay]);

  const selectDay = useCallback(
    async (day: Date) => {
      setSelectedDate(day);
      setShowCalendar(false);
      setTurnError(null);
      try {
        await loadDay(day);
      } catch {
        setLoadError(true);
      }
    },
    [loadDay],
  );

  const onMonthChange = useCallback(async (anchor: Date) => {
    try {
      const { from, to } = monthRange(anchor);
      setSessionDates(new Set(await getCompanionSessionDates(from, to)));
    } catch {
      // dots are decoration; a failed month fetch must not break the page
    }
  }, []);

  // Keep the latest turn in view as text streams in (today only).
  useEffect(() => {
    if (isToday) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamText, captures.length, isToday]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text === "" || sending) return;
      setSending(true);
      setTurnError(null);
      setDraft("");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text, at: localIso() },
      ]);
      setStreamText("");

      let response: Response;
      try {
        response = await fetch("/api/companion/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        if (!response.ok || !response.body) throw new Error(String(response.status));
      } catch {
        // Never reached the route: the message was NOT saved. Give the words back.
        setMessages((prev) => prev.slice(0, -1));
        setDraft(raw);
        setStreamText(null);
        setTurnError("transport");
        setSending(false);
        return;
      }

      let acc = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim() === "") continue;
            let event: TurnEvent;
            try {
              event = JSON.parse(line) as TurnEvent;
            } catch {
              continue;
            }
            if (event.type === "text_delta") {
              acc += event.text;
              setStreamText(acc);
            } else if (event.type === "card") {
              // Upsert by id: Sage can UPDATE a proposed card mid-conversation
              // ("put that in its own project") and it must morph in place.
              setCaptures((prev) =>
                prev.some((c) => c.id === event.capture.id)
                  ? prev.map((c) => (c.id === event.capture.id ? event.capture : c))
                  : [...prev, event.capture],
              );
            } else if (event.type === "done") {
              if (typeof event.sessionId === "number") {
                setSessionId(event.sessionId);
                // First message of the day: light today's calendar dot.
                setSessionDates((prev) => new Set(prev).add(dateKey(new Date())));
              }
              const finalText = event.text || acc;
              if (finalText) {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: finalText, at: localIso() },
                ]);
              }
              setStreamText(null);
            } else if (event.type === "error") {
              // The route saved the user's words before the AI ran.
              if (acc) {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: acc, at: localIso() },
                ]);
              }
              setStreamText(null);
              setTurnError("ai");
            }
          }
        }
      } finally {
        setStreamText(null);
        setSending(false);
      }
    },
    [sending],
  );

  // ---- trust-loop actions (shared state update) ----
  const swapCapture = (updated: CaptureDto) =>
    setCaptures((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  const keep = async (id: number) => {
    const { capture } = await confirmCapture(id);
    swapCapture(capture);
  };
  const toss = async (id: number) => swapCapture(await dismissCapture(id));
  const restore = async (id: number) => swapCapture(await restoreCapture(id));
  const saveEdit = async (id: number, payload: CaptureDto["payload"]) =>
    swapCapture(await updateCapture(id, payload));

  // ---- timeline: messages + cards interleaved by real time ----
  // Parse-based comparison: transcripts contain both legacy UTC "Z" strings
  // (pre-fix) and local no-suffix strings - string compare would mis-order them.
  const timeline: TimelineItem[] = [
    ...messages.map((m) => ({ kind: "msg" as const, at: m.at, msg: m })),
    ...captures.map((c) => ({ kind: "card" as const, at: c.createdAt, capture: c })),
  ].sort((a, b) => (new Date(a.at).getTime() || 0) - (new Date(b.at).getTime() || 0));

  const empty = timeline.length === 0 && streamText === null;
  const dayLabel = selectedDate.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const calendar = (
    <CompanionCalendar
      selected={selectedDate}
      sessionDates={sessionDates}
      onSelect={(d) => void selectDay(d)}
      onMonthChange={(a) => void onMonthChange(a)}
    />
  );

  const cardsPanel = (
    <CardsPanel
      captures={captures}
      projects={projects}
      onKeep={keep}
      onToss={toss}
      onRestore={restore}
    />
  );

  return (
    <div className="max-w-5xl mx-auto lg:flex lg:items-start lg:gap-4">
      {/* Chat panel */}
      <div className="flex-1 max-w-2xl mx-auto lg:mx-0 rounded-2xl bg-c-bg text-c-ink -mx-2 sm:mx-auto min-h-[70vh] flex flex-col">
        {/* Daily header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-5 pb-3 border-b border-c-line">
          <span className="w-9 h-9 rounded-full bg-c-accent-soft text-c-accent flex items-center justify-center">
            <SageGlyph className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <h1 className="font-heading text-lg font-semibold leading-tight">{COMPANION_NAME}</h1>
            <p className="text-xs text-c-muted">
              {dayLabel}
              {isToday ? " · a new thread each day" : " · looking back"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            aria-label="Open calendar and cards"
            aria-expanded={showCalendar}
            className="lg:hidden min-h-11 min-w-11 flex items-center justify-center rounded-lg text-c-muted hover:text-c-ink hover:bg-c-accent-soft cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
          >
            <CalendarDays size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Mobile pull-out (right drawer): calendar + cards. Desktop uses the
            sticky rail instead. Plain fixed is safe here - no transformed
            ancestor on this page (the /time-sheet precedent). */}
        {showCalendar && (
          <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-label="Calendar and cards">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setShowCalendar(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-sm bg-c-bg border-l border-c-line p-4 space-y-4 overflow-y-auto">
              {calendar}
              {cardsPanel}
            </div>
          </div>
        )}

        {loadError && (
          <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-c-line bg-c-card px-4 py-3 text-sm text-c-ink">
            Tasklog&apos;s API is unreachable, so the conversation can&apos;t load or save right
            now. Check that the backend is running, then reload.
          </div>
        )}

        {/* Stream */}
        <div className="flex-1 px-4 sm:px-6 py-5 space-y-4">
          {empty && isToday && (
            <div className="pt-6 text-center">
              <span className="inline-flex w-12 h-12 rounded-full bg-c-accent-soft text-c-accent items-center justify-center">
                <SageGlyph className="w-6 h-6" />
              </span>
              <p className="mt-3 text-base text-c-ink max-w-[38ch] mx-auto">{COMPANION_GREETING}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {STARTER_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={sending || loadError}
                    onClick={() => send(chip)}
                    className="min-h-11 px-4 rounded-full border border-c-line bg-c-card text-sm text-c-ink cursor-pointer transition-colors duration-150 hover:bg-c-accent-soft disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {empty && !isToday && (
            <p className="pt-8 text-center text-sm text-c-muted">
              No conversation on {dayLabel}.
            </p>
          )}

          {timeline.map((item) =>
            item.kind === "msg" ? (
              <div
                key={`m-${item.at}-${item.msg.role}-${item.msg.content.slice(0, 24)}`}
                className={item.msg.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap ${
                    item.msg.role === "user"
                      ? "bg-c-accent-soft text-c-ink rounded-br-md"
                      : "bg-c-card border border-c-line text-c-ink rounded-bl-md"
                  }`}
                >
                  {item.msg.content}
                  <span className="block text-[10px] text-c-muted mt-1 text-right">
                    {timeLabel(item.at)}
                  </span>
                </div>
              </div>
            ) : (
              <div key={`c-${item.capture.id}`} className="flex justify-start">
                <div className="max-w-[85%] w-full sm:w-[85%]">
                  <ProposalCard
                    capture={item.capture}
                    projects={projects}
                    onKeep={keep}
                    onToss={toss}
                    onRestore={restore}
                    onSaveEdit={saveEdit}
                  />
                </div>
              </div>
            ),
          )}

          {/* Live assistant turn */}
          {streamText !== null && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-c-card border border-c-line px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap">
                {streamText === "" ? (
                  <span className="inline-flex items-center gap-1.5 text-c-muted text-sm" aria-label={`${COMPANION_NAME} is thinking`}>
                    {COMPANION_NAME} is thinking
                    <span className="inline-flex gap-0.5 motion-safe:animate-pulse" aria-hidden="true">
                      <span>·</span><span>·</span><span>·</span>
                    </span>
                  </span>
                ) : (
                  streamText
                )}
              </div>
            </div>
          )}

          {turnError === "ai" && (
            <p className="text-sm text-c-muted text-center">
              {COMPANION_NAME} is unreachable right now. Your words are saved - try again in a bit.
            </p>
          )}
          {turnError === "transport" && (
            <p className="text-sm text-danger text-center">
              Couldn&apos;t reach the companion, so that message was NOT saved. It&apos;s back in
              the box below.
            </p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Composer (today) / back-to-today bar (history) */}
        {isToday ? (
          <div className="sticky bottom-2 px-4 sm:px-6 pb-2 pt-1 bg-c-bg/95 backdrop-blur-sm rounded-b-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="companion-input" className="sr-only">
                Message {COMPANION_NAME}
              </label>
              <textarea
                id="companion-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={draft.includes("\n") ? 3 : 1}
                placeholder={`Talk to ${COMPANION_NAME}...`}
                disabled={loadError}
                className="flex-1 resize-none rounded-2xl border border-c-line bg-c-card px-4 py-3 text-base text-c-ink placeholder:text-c-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || draft.trim() === "" || loadError}
                aria-label={`Send to ${COMPANION_NAME}`}
                className="min-h-11 min-w-11 rounded-full bg-c-accent text-white flex items-center justify-center disabled:opacity-50 cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" aria-hidden="true">
                  <path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
        ) : (
          <div className="sticky bottom-2 px-4 sm:px-6 pb-3 pt-1 bg-c-bg/95 backdrop-blur-sm rounded-b-2xl">
            <button
              type="button"
              onClick={() => void selectDay(new Date())}
              className="w-full min-h-11 rounded-2xl border border-c-line bg-c-card text-sm text-c-ink cursor-pointer hover:bg-c-accent-soft transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            >
              Viewing {dayLabel} - back to today
            </button>
          </div>
        )}
      </div>

      {/* Desktop rail: sticky so calendar + cards stay in reach while the
          conversation scrolls (the "cards scroll away" fix). Dashboard-y
          additions (stats etc.) are a later, backlogged idea. */}
      <aside className="hidden lg:block w-64 shrink-0 pt-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto space-y-3 lg:pb-20">
        {calendar}
        {cardsPanel}
        <p className="px-1 text-xs text-c-muted">
          A dot marks a day you talked. Past days are read-only; their suggestion
          cards stay actionable.
        </p>
      </aside>
    </div>
  );
}
