"use client";

// The /journal page (#79): one date's journal. Note column (left) renders the templates'
// sections as one continuous editable note; the rail (right on desktop, top on mobile)
// holds the calendar, mood arc, Front/Back-of-Mind, and Today-so-far widgets.
//
// State model: `contents` is the draft content object per template key; every section
// edit updates it and schedules a debounced PUT upsert for that template (one entry per
// template per date is guaranteed server-side). Check-ins, tasks, and time are fetched
// per date; a light poll keeps the derived "Unplanned, got done" bucket and habit counts
// fresh while the page is open.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Moon, Sun } from "lucide-react";
import {
  getJournalTemplates,
  getJournalEntries,
  getJournalEntryDates,
  upsertJournalEntry,
  getMoodCheckins,
  getTasksCompletedOn,
  getTasks,
  getProjects,
  getHabits,
  getTimeEntries,
  createTask,
  completeTask,
  addMoodCheckin,
  deleteMoodCheckin,
  journalExportUrl,
  JournalTemplateDef,
  MoodCheckinDto,
  Task,
  Project,
} from "@/lib/api";
import { dateKey, addDays, dayTotalSeconds } from "@/lib/time";
import {
  MindItem,
  PlanContent,
  emptyPlan,
  rolloverCandidates,
} from "@/lib/journal";
import { usePolling } from "@/hooks/usePolling";
import CheckinsSection from "./CheckinsSection";
import ProseSection from "./ProseSection";
import ProjectsSection from "./ProjectsSection";
import PlanSection from "./PlanSection";
import EveningSection from "./EveningSection";
import ListSection from "./ListSection";
import CalendarWidget from "./CalendarWidget";
import MoodArcWidget from "./MoodArcWidget";
import MindWidget from "./MindWidget";
import TodaySoFarWidget from "./TodaySoFarWidget";
import FeelingsWheelModal from "./FeelingsWheelModal";
import JournalPreview from "./JournalPreview";

type Contents = Record<string, Record<string, unknown>>;

const SAVE_DEBOUNCE_MS = 800;

export default function JournalClient() {
  const [date, setDate] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [templates, setTemplates] = useState<JournalTemplateDef[]>([]);
  const [contents, setContents] = useState<Contents>({});
  const [yesterdayDaily, setYesterdayDaily] = useState<Record<string, unknown> | null>(null);
  const [checkins, setCheckins] = useState<MoodCheckinDto[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedOnDate, setCompletedOnDate] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entryDates, setEntryDates] = useState<Set<string>>(new Set());
  const [habitsDone, setHabitsDone] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = dateKey(date);
  const isToday = key === dateKey(new Date());
  // Debounced save timers + latest contents, per template key.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const contentsRef = useRef<Contents>({});
  contentsRef.current = contents;
  const eveningRef = useRef<HTMLDivElement | null>(null);
  const autoJumped = useRef(false);

  // ---------- loading ----------

  const loadStatic = useCallback(async () => {
    const [tpls, allTasks, projs] = await Promise.all([getJournalTemplates(), getTasks(), getProjects()]);
    setTemplates(tpls);
    setTasks(allTasks);
    setProjects(projs);
  }, []);

  const loadDay = useCallback(async (day: Date) => {
    const k = dateKey(day);
    const prevK = dateKey(addDays(day, -1));
    const [entries, cks, completed, prevEntries, timeEntries, habits] = await Promise.all([
      getJournalEntries(k),
      getMoodCheckins(k),
      getTasksCompletedOn(k),
      getJournalEntries(prevK),
      getTimeEntries(k, dateKey(addDays(day, 1))),
      getHabits(),
    ]);
    const byKey: Contents = {};
    for (const e of entries) byKey[e.templateKey] = e.content;
    setContents(byKey);
    setCheckins(cks);
    setCompletedOnDate(completed);
    setYesterdayDaily(prevEntries.find((e) => e.templateKey === "daily")?.content ?? null);
    setTimeSeconds(dayTotalSeconds(timeEntries, day, new Date()));
    setHabitsDone({ done: habits.filter((h) => h.doneToday).length, total: habits.length });
  }, []);

  const loadMonthDots = useCallback(async (anchor: Date) => {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    setEntryDates(new Set(await getJournalEntryDates(dateKey(from), dateKey(to))));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadStatic(), loadDay(date), loadMonthDots(date)]);
        setError(null);
      } catch {
        setError("Could not load the journal. Is the API running?");
      } finally {
        setLoading(false);
      }
    })();
    // Re-runs when the selected date changes (key covers date identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Keep task-derived data fresh (tasks completed elsewhere appear in Unplanned).
  usePolling(
    useCallback(async () => {
      const [completed, allTasks] = await Promise.all([getTasksCompletedOn(key), getTasks()]);
      setCompletedOnDate(completed);
      setTasks(allTasks);
    }, [key]),
    30000,
    mode === "edit" && !loading,
  );

  // The cheap evening close: after 18:00, opening today's journal lands on the evening
  // cluster (once per mount; respects reduced motion via scrollIntoView's default).
  useEffect(() => {
    if (!loading && isToday && !autoJumped.current && new Date().getHours() >= 18) {
      autoJumped.current = true;
      setTimeout(() => jumpToEvening(), 300);
    }
  }, [loading, isToday]);

  // ---------- saving ----------

  const scheduleSave = useCallback(
    (templateKey: string) => {
      clearTimeout(saveTimers.current[templateKey]);
      saveTimers.current[templateKey] = setTimeout(async () => {
        try {
          setSaveState("saving");
          await upsertJournalEntry(templateKey, key, contentsRef.current[templateKey] ?? {});
          setSaveState("saved");
          setEntryDates((prev) => new Set(prev).add(key));
        } catch {
          setSaveState("error");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [key],
  );

  const updateSection = useCallback(
    (templateKey: string, sectionKey: string, value: unknown) => {
      setContents((prev) => ({
        ...prev,
        [templateKey]: { ...(prev[templateKey] ?? {}), [sectionKey]: value },
      }));
      scheduleSave(templateKey);
    },
    [scheduleSave],
  );

  // ---------- derived ----------

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const daily = contents["daily"] ?? {};
  const plan = (daily["todays_plan"] as PlanContent | undefined) ?? emptyPlan();
  const planIds = useMemo(() => new Set(Object.values(plan.buckets).flat()), [plan]);
  const unplanned = useMemo(
    () => completedOnDate.filter((t) => !planIds.has(t.id)),
    [completedOnDate, planIds],
  );
  const planDone = [...planIds].filter((id) => tasksById.get(id)?.isCompleted).length;

  const fom = (daily["front_of_mind"] as MindItem[] | undefined) ?? [];
  const bom = (daily["back_of_mind"] as MindItem[] | undefined) ?? [];
  const fomRolled = rolloverCandidates(
    (yesterdayDaily?.["front_of_mind"] as MindItem[] | undefined) ?? undefined,
    fom,
  );
  const bomRolled = rolloverCandidates(
    (yesterdayDaily?.["back_of_mind"] as MindItem[] | undefined) ?? undefined,
    bom,
  );

  // ---------- actions ----------

  const handleCreateTask = useCallback(
    async (title: string): Promise<Task> => {
      // Born from the day's plan: due that day, Inbox, defaults elsewhere.
      const task = await createTask(title, key);
      setTasks((prev) => [task, ...prev]);
      return task;
    },
    [key],
  );

  const handleToggleTask = useCallback(
    async (id: number, isCompleted: boolean) => {
      // Optimistic: flip locally, reconcile with the server response.
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, isCompleted } : t)));
      try {
        const updated = await completeTask(id, isCompleted);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setCompletedOnDate(await getTasksCompletedOn(key));
      } catch {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, isCompleted: !isCompleted } : t)));
      }
    },
    [key],
  );

  const handleSaveCheckin = useCallback(
    async (words: string[], energy: number, mocLevel: number | null) => {
      await addMoodCheckin(words, energy, mocLevel);
      setCheckins(await getMoodCheckins(key));
      setWheelOpen(false);
    },
    [key],
  );

  const handleDeleteCheckin = useCallback(
    async (id: number) => {
      await deleteMoodCheckin(id);
      setCheckins(await getMoodCheckins(key));
    },
    [key],
  );

  const jumpToEvening = () => {
    eveningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const selectDate = (d: Date) => {
    setMode("edit");
    setDate(d);
    if (d.getMonth() !== date.getMonth() || d.getFullYear() !== date.getFullYear()) {
      loadMonthDots(d);
    }
  };

  // ---------- render ----------

  const dailyTemplate = templates.find((t) => t.key === "daily");
  const extraTemplates = templates.filter((t) => t.key !== "daily");

  if (error) {
    return <p className="text-danger text-sm py-8">{error}</p>;
  }

  return (
    <div className="rounded-2xl bg-j-paper text-j-ink p-4 sm:p-6 -mx-2 sm:mx-0">
      {/* Header: date, mode toggle, export */}
      <header className="flex flex-wrap items-center gap-3 border-b border-j-line pb-4 mb-6">
        <h1 className="font-heading text-xl font-bold">Journal</h1>
        <span className="text-sm rounded-full border border-j-line bg-j-card px-3.5 py-1.5">
          {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          {!isToday && (
            <button
              onClick={() => selectDate(new Date())}
              className="ml-2 text-j-accent font-medium cursor-pointer focus:outline-none focus:underline"
            >
              today
            </button>
          )}
        </span>
        <span className="text-xs text-j-muted min-w-14" role="status">
          {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : saveState === "error" ? "save failed - retrying on next edit" : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-j-line bg-j-card overflow-hidden" role="tablist" aria-label="Mode">
            {(["edit", "preview"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 text-sm capitalize cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent ${
                  mode === m ? "bg-j-ink text-j-paper font-semibold" : "text-j-muted hover:text-j-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <a
            href={journalExportUrl(key)}
            download
            aria-label="Download this day as markdown"
            title="Download this day as markdown"
            className="grid place-items-center w-9 h-9 rounded-lg border border-j-line bg-j-card text-j-muted hover:text-j-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
          >
            <Download size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-j-muted py-10 text-center">Loading the day…</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Rail: right on desktop, stacked on top on mobile */}
          <aside className="w-full lg:w-[300px] lg:order-2 lg:sticky lg:top-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
            <CalendarWidget selected={date} entryDates={entryDates} onSelect={selectDate} onMonthChange={loadMonthDots} />
            <MoodArcWidget checkins={checkins} onLog={() => setWheelOpen(true)} />
            <MindWidget
              title="Front of mind"
              items={fom}
              rolled={fomRolled}
              onChange={(items) => updateSection("daily", "front_of_mind", items)}
            />
            <MindWidget
              title="Back of mind"
              items={bom}
              rolled={bomRolled}
              onChange={(items) => updateSection("daily", "back_of_mind", items)}
            />
            <TodaySoFarWidget
              planDone={planDone}
              planTotal={planIds.size}
              unplannedDone={unplanned.length}
              timeSeconds={timeSeconds}
              habitsDone={habitsDone.done}
              habitsTotal={habitsDone.total}
              checkinCount={checkins.length}
            />
            <button
              onClick={jumpToEvening}
              className="hidden lg:block w-full rounded-xl border border-j-line bg-j-card py-2.5 text-sm font-semibold text-j-accent hover:bg-j-accent-soft cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
            >
              Jump to evening ↓
            </button>
          </aside>

          {/* Note column */}
          <main className="flex-1 min-w-0 max-w-2xl lg:order-1">
            {mode === "preview" ? (
              <JournalPreview date={key} />
            ) : (
              <div className="space-y-3.5">
                {dailyTemplate?.sections.map((section) => {
                  if (section.kind === "mind") return null; // rail widgets own these
                  const value = daily[section.key];
                  const onChange = (v: unknown) => updateSection("daily", section.key, v);
                  switch (section.kind) {
                    case "checkins":
                      return (
                        <CheckinsSection
                          key={section.key}
                          title={section.title}
                          checkins={checkins}
                          onDelete={handleDeleteCheckin}
                        />
                      );
                    case "prose":
                      return (
                        <ProseSection
                          key={section.key}
                          title={section.title}
                          value={(value as string | undefined) ?? ""}
                          optional={section.optional}
                          onChange={onChange}
                        />
                      );
                    case "projects":
                      return (
                        <ProjectsSection
                          key={section.key}
                          title={section.title}
                          value={(value as { name: string; focus: string }[] | undefined) ?? []}
                          projects={projects}
                          onChange={onChange}
                        />
                      );
                    case "plan":
                      return (
                        <PlanSection
                          key={section.key}
                          title={section.title}
                          plan={plan}
                          tasksById={tasksById}
                          unplanned={unplanned}
                          isToday={isToday}
                          onChange={onChange}
                          onCreateTask={handleCreateTask}
                          onToggleTask={handleToggleTask}
                          onSearch={(text) => Promise.resolve(searchLocal(tasks, text, planIds))}
                        />
                      );
                    case "evening":
                      return (
                        <div key={section.key} ref={eveningRef}>
                          <EveningSection
                            title={section.title}
                            value={(value as Record<string, string> | undefined) ?? {}}
                            checkins={checkins}
                            onChange={onChange}
                          />
                        </div>
                      );
                    default:
                      return null;
                  }
                })}

                {extraTemplates.map((tpl) =>
                  tpl.sections.map((section) => {
                    const value = (contents[tpl.key] ?? {})[section.key];
                    const onChange = (v: unknown) => updateSection(tpl.key, section.key, v);
                    if (section.kind === "list") {
                      return (
                        <ListSection
                          key={`${tpl.key}.${section.key}`}
                          title={section.title}
                          hint={tpl.key === "affirmations" ? "revisit at close - celebrate what held" : undefined}
                          value={(value as string[] | undefined) ?? []}
                          onChange={onChange}
                        />
                      );
                    }
                    if (section.kind === "prose") {
                      return (
                        <ProseSection
                          key={`${tpl.key}.${section.key}`}
                          title={section.title}
                          value={(value as string | undefined) ?? ""}
                          optional={section.optional}
                          onChange={onChange}
                        />
                      );
                    }
                    return null;
                  }),
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Mobile: floating evening jump */}
      <button
        onClick={jumpToEvening}
        className="lg:hidden fixed bottom-5 right-4 z-40 rounded-full bg-j-ink text-j-paper px-5 py-3 text-sm font-semibold shadow-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
        style={{ display: mode === "preview" ? "none" : undefined }}
      >
        Evening ↓
      </button>

      {wheelOpen && (
        <FeelingsWheelModal onSave={handleSaveCheckin} onClose={() => setWheelOpen(false)} />
      )}
    </div>
  );
}

// Local type-ahead over the already-loaded task list (open tasks not yet planned).
// Server search exists too (searchOpenTasks) but the full list is already in memory
// for id lookups, so filtering locally avoids a round-trip per keystroke.
function searchLocal(tasks: Task[], text: string, planned: Set<number>): Task[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  return tasks
    .filter((t) => !t.isCompleted && !planned.has(t.id) && t.title.toLowerCase().includes(q))
    .slice(0, 6);
}
