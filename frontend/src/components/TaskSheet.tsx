"use client";

/* Chip-driven create/edit task sheet (#73). One component for both:
 *   - create: the title is a quick-add line. Recognized tokens stay HIGHLIGHTED in
 *     the input (so an accidental one is visible and removable before save); the
 *     chips are DERIVED from the current title each render, so deleting a token
 *     clears its chip. On submit the title is cleaned from the same parse, which
 *     guarantees "highlighted <=> removed from the saved title" by construction.
 *   - edit:   title is literal (no parsing/highlighting); chips are seeded from the
 *     task and edited via the pickers; fields diff against the original on save.
 *
 * Layout: centered modal at >=640px, keyboard-aware bottom-sheet below. Each field
 * (due date / priority / project / label / recurrence) is a <Chip> that opens its
 * picker in a <PickerSheet>. Replaces AddTaskForm + EditTaskModal. */

import { useState, useEffect, useMemo, useCallback, useRef, FormEvent } from "react";
import { X, Loader2, Calendar, Flag, Folder, Tag, Repeat } from "lucide-react";
import {
  Task,
  Project,
  Label,
  createTask,
  updateTask,
  setTaskLabels,
  assignTaskProject,
  getTask,
  createLabel,
  createProject,
} from "@/lib/api";
import { priorityMeta, formatDeadline, describeRecurrence } from "@/lib/format";
import { parseQuickAdd, tokenKey, QuickAddTokenType } from "@/lib/quickAdd";
import { resolvePreset } from "@/lib/deadlinePresets";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import Chip from "./Chip";
import QuickAddInput from "./QuickAddInput";
import RecurrencePicker from "./RecurrencePicker";
import PickerSheet from "./PickerSheet";
import DueDatePicker from "./pickers/DueDatePicker";
import PriorityPicker from "./pickers/PriorityPicker";
import ProjectPicker from "./pickers/ProjectPicker";
import LabelPicker from "./pickers/LabelPicker";
import TaskTimeLog from "./TaskTimeLog";

interface Props {
  // The task being edited, or undefined to create a new one.
  task?: Task;
  projects: Project[];
  allLabels: Label[];
  // Which project to pre-select when creating (the active sidebar view). Null = Inbox.
  defaultProjectId?: number | null;
  // Called after a successful create or save with the canonical task.
  onSaved: (task: Task) => void;
  onClose: () => void;
}

type OpenPicker = null | "due" | "priority" | "project" | "label" | "recurrence";

export default function TaskSheet({ task, projects, allLabels, defaultProjectId, onSaved, onClose }: Props) {
  const isEdit = !!task;

  // --- Title + description ---
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");

  // --- Manual field state (set by the pickers). In edit mode these ARE the values;
  //     in create mode they are overlaid by tokens parsed from the title (see eff* below). ---
  const [deadline, setDeadline] = useState<string | null>(task?.deadline ?? null);
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [projectId, setProjectId] = useState<number | null>(task ? task.projectId : defaultProjectId ?? null);
  const [labels, setLabels] = useState<Label[]>(allLabels); // growable (created labels appended)
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(task ? task.labels.map((l) => l.id) : []);
  const [recurrence, setRecurrence] = useState<string | null>(task?.recurrence ?? null);
  const [isHabit, setIsHabit] = useState(task?.isHabit ?? false);
  // Habit schedule mode (#75). A habit is scheduled EITHER on specific days (recurrence)
  // OR "x times a week" (weeklyTarget) - never both. The mode drives which value is saved.
  const [scheduleMode, setScheduleMode] = useState<"days" | "frequency">(
    task?.weeklyTarget != null ? "frequency" : "days",
  );
  const [weeklyTarget, setWeeklyTarget] = useState<number>(task?.weeklyTarget ?? 3);
  // Token keys the user dismissed with Escape (keep as literal text, do not parse).
  // Pruned whenever the title changes so editing the span lets it re-match.
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Chip anchors for popover positioning.
  const dueRef = useRef<HTMLButtonElement>(null);
  const priorityRef = useRef<HTMLButtonElement>(null);
  const projectRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
  const recurrenceRef = useRef<HTMLButtonElement>(null);

  // Desktop modal vs mobile bottom-sheet (matches PickerSheet's breakpoint).
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const keyboardHeight = useKeyboardHeight();

  // Escape-to-close is handled on the dialog's onKeyDown (below), NOT a document
  // listener: that lets QuickAddInput's Escape-to-un-recognize call stopPropagation()
  // and reliably prevent the close (a document listener fires regardless of the
  // input's stopPropagation in React's App-Router event model).

  // Parse the title, dropping any tokens the user dismissed (ignored). Recomputes the
  // cleaned title + each field from only the ACTIVE tokens, so a dismissed token stays
  // as literal text in both the chips and the saved title. Returns null in edit mode.
  const buildParse = useCallback(
    (text: string) => {
      if (isEdit || !text.trim()) return null;
      const raw = parseQuickAdd(text, projects);
      const active = raw.tokens.filter((t) => !ignored.has(tokenKey(t)));
      const types = new Set(active.map((t) => t.type));
      let cleaned = text;
      for (const t of [...active].sort((a, b) => b.start - a.start)) cleaned = cleaned.slice(0, t.start) + cleaned.slice(t.end);
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
      const labelNames = active.filter((t) => t.type === "label").map((t) => t.text.replace(/^@/, ""));
      return {
        cleanedTitle: cleaned,
        // A bare-weekday recurrence sets deadline via its recurrence token, so accept
        // deadline if either a date OR a recurrence token is active.
        deadline: types.has("date") || (types.has("recurrence") && raw.deadline) ? raw.deadline : undefined,
        priority: types.has("priority") ? raw.priority : undefined,
        recurrence: types.has("recurrence") ? raw.recurrence : undefined,
        projectName: types.has("project") ? raw.projectName : undefined,
        labelNames: labelNames.length ? labelNames : undefined,
      };
    },
    [isEdit, projects, ignored],
  );

  const parsed = useMemo(() => buildParse(title), [buildParse, title]);

  // Prune dismissed tokens that no longer correspond to a current token (the user
  // edited that span) so editing the text lets it re-match - the "remove y, add y
  // re-recognizes" behavior. No-op in edit mode.
  useEffect(() => {
    if (isEdit) return;
    setIgnored((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(parseQuickAdd(title, projects).tokens.map(tokenKey));
      const kept = [...prev].filter((k) => present.has(k));
      return kept.length === prev.size ? prev : new Set(kept); // unchanged -> same ref (no loop)
    });
  }, [title, projects, isEdit]);

  // Effective values: a parsed token (if present) overrides the manual chip value.
  const effDeadline = parsed?.deadline ?? deadline;
  const effPriority = parsed?.priority ?? priority;
  const effRecurrence = parsed?.recurrence ?? recurrence;
  const parsedProjectName = parsed?.projectName ?? null;
  // A typed #project may be new (no id yet); resolve a known one for the picker value.
  const effProjectId = parsedProjectName
    ? projects.find((p) => p.name.toLowerCase() === parsedProjectName.toLowerCase())?.id ?? null
    : projectId;
  const effProjectName = parsedProjectName
    ?? (projectId !== null ? projects.find((p) => p.id === projectId)?.name ?? "Inbox" : "Inbox");
  const effLabelNames = useMemo(() => {
    const fromIds = selectedLabelIds.map((id) => labels.find((l) => l.id === id)?.name).filter((n): n is string => !!n);
    return Array.from(new Set([...(parsed?.labelNames ?? []), ...fromIds]));
  }, [parsed, selectedLabelIds, labels]);

  // When a picker sets a field that ALSO has a token in the title, the token would
  // otherwise win (parsed-first). So a picker action strips that field's token from
  // the title, handing control to the manual value. No-op in edit mode.
  function clearTokenOfType(type: QuickAddTokenType) {
    if (isEdit) return;
    const p = parseQuickAdd(title, projects);
    const toks = p.tokens.filter((t) => t.type === type);
    if (toks.length === 0) return;
    let next = title;
    for (const t of [...toks].sort((a, b) => b.start - a.start)) next = next.slice(0, t.start) + next.slice(t.end);
    setTitle(next.replace(/\s{2,}/g, " ").trim());
  }

  // --- Resolve-or-create helpers (labels + projects auto-create on @/# like Todoist) ---
  async function resolveOrCreateLabel(name: string): Promise<Label | null> {
    const existing = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    try {
      const created = await createLabel(name, labels.length % 10);
      setLabels((prev) => [...prev, created]);
      return created;
    } catch {
      return null;
    }
  }
  async function resolveOrCreateProject(name: string): Promise<number | null> {
    const existing = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    try {
      return (await createProject(name)).id;
    } catch {
      return null;
    }
  }
  function toggleLabel(id: number) {
    setSelectedLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  async function handleLabelCreate(name: string) {
    const label = await resolveOrCreateLabel(name);
    if (label) setSelectedLabelIds((prev) => (prev.includes(label.id) ? prev : [...prev, label.id]));
    else {
      setError("Couldn't create label. Try again.");
      setTimeout(() => setError(""), 3000);
    }
  }

  // --- Submit ---
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (isEdit) await handleSave();
    else await handleCreate();
  }

  async function handleCreate() {
    // Use the same ignore-aware parse the chips/highlights use, so the cleaned title
    // strips exactly the still-highlighted tokens (dismissed ones stay as text) and
    // nothing recognized leaks into the saved title.
    const p = buildParse(title) ?? { cleanedTitle: title.trim(), deadline: undefined, recurrence: undefined, priority: undefined, projectName: undefined, labelNames: undefined };
    const finalTitle = p.cleanedTitle || title.trim();
    if (!finalTitle) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    try {
      let finalDeadline = p.deadline ?? deadline ?? undefined;

      // Habit schedule (#75): a frequency habit sends weeklyTarget and NO recurrence; a
      // specific-days habit (or any non-habit recurring task) sends recurrence. A habit's
      // recurrence needs no deadline anchor; a non-habit recurring task still does.
      const frequencyMode = isHabit && scheduleMode === "frequency";
      const finalWeeklyTarget = frequencyMode ? weeklyTarget : undefined;
      const finalRecurrence = frequencyMode
        ? undefined
        : p.recurrence ?? ((finalDeadline || isHabit) ? recurrence ?? undefined : undefined);
      if (finalRecurrence && !finalDeadline && !isHabit) finalDeadline = resolvePreset("today") ?? undefined;
      const finalPriority = p.priority ?? priority;

      // Project: a typed #project (known or new) wins and resolve-or-creates; else the chip.
      const finalProjectId = p.projectName ? await resolveOrCreateProject(p.projectName) : projectId;

      // Labels: the manually-selected ids plus any @tokens in the title (resolve-or-create).
      const labelObjs: Label[] = selectedLabelIds
        .map((id) => labels.find((l) => l.id === id))
        .filter((l): l is Label => !!l);
      for (const name of p.labelNames ?? []) {
        const label = await resolveOrCreateLabel(name);
        if (label && !labelObjs.some((l) => l.id === label.id)) labelObjs.push(label);
      }
      const labelIds = labelObjs.map((l) => l.id);

      let created = await createTask(
        finalTitle,
        finalDeadline,
        finalProjectId,
        finalPriority,
        description.trim() || undefined,
        finalRecurrence,
        isHabit,
        finalWeeklyTarget,
      );
      if (labelIds.length > 0) created = await setTaskLabels(created.id, labelIds);
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task.");
      setSaving(false);
    }
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
    const t = task!;

    // Diff against the original; fire only what changed (mirrors EditTaskModal).
    const origLabelIds = t.labels.map((l) => l.id).sort();
    const newLabelIds = [...selectedLabelIds].sort();

    // Canonical "YYYY-MM-DDTHH:mm:ss" (or null) so a date OR time change is detected.
    const newDeadline = deadline
      ? deadline.length > 10
        ? `${deadline.slice(0, 10)}T${deadline.slice(11, 16)}:00`
        : `${deadline}T00:00:00`
      : null;
    const oldDeadline = t.deadline ? t.deadline.slice(0, 19) : null;

    // Habit schedule (#75): a frequency habit carries weeklyTarget and clears recurrence; a
    // specific-days habit (or non-habit) carries recurrence and clears weeklyTarget. The two
    // sides are never both values in one PATCH, so the backend's both-mode guard never trips.
    const frequencyMode = isHabit && scheduleMode === "frequency";
    const newWeeklyTarget = frequencyMode ? weeklyTarget : null;
    const weeklyTargetChanged = newWeeklyTarget !== (t.weeklyTarget ?? null);
    // A habit's recurrence needs no deadline anchor; a non-habit recurring task does.
    const newRecurrence = frequencyMode ? null : (newDeadline || isHabit) ? recurrence : null;

    const titleChanged = trimmed !== t.title;
    const deadlineChanged = newDeadline !== oldDeadline;
    const priorityChanged = priority !== t.priority;
    const newDescription = description.trim() || null;
    const descriptionChanged = newDescription !== (t.description ?? null);
    const recurrenceChanged = newRecurrence !== (t.recurrence ?? null);
    const isHabitChanged = isHabit !== t.isHabit;
    const projectChanged = projectId !== t.projectId;
    const labelsChanged =
      origLabelIds.length !== newLabelIds.length || origLabelIds.some((id, i) => id !== newLabelIds[i]);

    if (
      !titleChanged && !deadlineChanged && !priorityChanged && !descriptionChanged &&
      !recurrenceChanged && !weeklyTargetChanged && !isHabitChanged && !projectChanged && !labelsChanged
    ) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      if (titleChanged || deadlineChanged || priorityChanged || descriptionChanged || recurrenceChanged || weeklyTargetChanged || isHabitChanged) {
        const body: {
          title?: string;
          deadline?: string | null;
          priority?: number;
          description?: string | null;
          recurrence?: string | null;
          isHabit?: boolean;
          weeklyTarget?: number | null;
        } = {};
        if (titleChanged) body.title = trimmed;
        // Send the deadline whenever recurrence is being set, so the backend sees
        // the anchor in the same PATCH (it processes deadline before recurrence).
        if (deadlineChanged || (recurrenceChanged && newRecurrence)) body.deadline = newDeadline;
        if (priorityChanged) body.priority = priority;
        if (descriptionChanged) body.description = newDescription;
        // isHabit before recurrence/weeklyTarget mirrors the backend's processing order.
        if (isHabitChanged) body.isHabit = isHabit;
        if (recurrenceChanged) body.recurrence = newRecurrence;
        if (weeklyTargetChanged) body.weeklyTarget = newWeeklyTarget;
        await updateTask(t.id, body);
      }
      if (projectChanged) await assignTaskProject(t.id, projectId);
      if (labelsChanged) await setTaskLabels(t.id, selectedLabelIds);
      const updated = await getTask(t.id);
      onSaved(updated);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Failed to save changes.";
      setError(`${reason} Some changes may have been saved - refresh to check.`);
      setSaving(false);
    }
  }

  // --- Chip display values (derived effective values) ---
  const dueValue = effDeadline ? formatDeadline(effDeadline) : undefined;
  const priorityValue = effPriority !== 4 ? priorityMeta(effPriority).label : undefined;
  const projectValue = effProjectName;
  const labelValue =
    effLabelNames.length === 1 ? effLabelNames[0] : effLabelNames.length > 1 ? `${effLabelNames.length} labels` : undefined;
  // The schedule chip: for a frequency habit show "Nx / week"; otherwise the recurrence label.
  const recurrenceValue =
    isHabit && scheduleMode === "frequency"
      ? `${weeklyTarget}x / week`
      : effRecurrence
        ? describeRecurrence(effRecurrence)
        : undefined;

  const panelClasses = isDesktop
    ? "bg-surface rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] tl-pop"
    : "bg-surface rounded-t-2xl shadow-xl w-full flex flex-col max-h-[85vh] tl-slide-up pb-[env(safe-area-inset-bottom,0)]";

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/40 ${isDesktop ? "items-center p-4" : "items-end"}`}
      onMouseDown={(e) => {
        if (saving) return; // don't dismiss mid-save
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        // Close on Escape - but QuickAddInput stops the event first when Escape
        // un-recognizes a token, so this only fires when there's nothing to dismiss.
        if (e.key === "Escape" && openPicker === null && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit task" : "New task"}
        className={panelClasses}
        style={!isDesktop ? { marginBottom: keyboardHeight } : undefined}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-heading text-base font-semibold text-text-primary">
            {isEdit ? "Edit task" : "New task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer transition-colors duration-150"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            {/* Title - quick-add field on create (highlights tokens), plain on edit. */}
            <div>
              <label htmlFor="sheet-title" className="block text-sm font-medium text-text-primary mb-1">
                Title
              </label>
              <QuickAddInput
                id="sheet-title"
                value={title}
                onChange={setTitle}
                projects={projects}
                labels={labels}
                disabled={saving}
                placeholder={isEdit ? "Task title" : 'e.g. "Email Mark friday #Work @urgent p1"'}
                showCapturedChips={false}
                highlight={!isEdit}
                ignoredKeys={ignored}
                onIgnoreToken={(k) => setIgnored((prev) => new Set(prev).add(k))}
                tapToDismiss={!isDesktop}
              />
              {error && (
                <p className="mt-1 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* Chip row. A habit has no due date (its schedule lives in the Repeat chip), so
                the Due chip is hidden when "Track as a daily habit" is on (#75). */}
            <div className="flex flex-wrap gap-2">
              {!isHabit && (
                <Chip
                  chipRef={dueRef}
                  icon={<Calendar size={16} aria-hidden="true" />}
                  label="Due date"
                  value={dueValue}
                  active={openPicker === "due"}
                  disabled={saving}
                  onClick={() => setOpenPicker(openPicker === "due" ? null : "due")}
                />
              )}
              <Chip
                chipRef={priorityRef}
                icon={<Flag size={16} aria-hidden="true" />}
                label="Priority"
                value={priorityValue}
                active={openPicker === "priority"}
                disabled={saving}
                onClick={() => setOpenPicker(openPicker === "priority" ? null : "priority")}
              />
              <Chip
                chipRef={projectRef}
                icon={<Folder size={16} aria-hidden="true" />}
                label="Project"
                value={projectValue}
                active={openPicker === "project"}
                disabled={saving}
                onClick={() => setOpenPicker(openPicker === "project" ? null : "project")}
              />
              <Chip
                chipRef={labelRef}
                icon={<Tag size={16} aria-hidden="true" />}
                label="Label"
                value={labelValue}
                active={openPicker === "label"}
                disabled={saving}
                onClick={() => setOpenPicker(openPicker === "label" ? null : "label")}
              />
              <Chip
                chipRef={recurrenceRef}
                icon={<Repeat size={16} aria-hidden="true" />}
                label={isHabit ? "Schedule" : "Repeat"}
                value={recurrenceValue}
                active={openPicker === "recurrence"}
                disabled={saving}
                onClick={() => setOpenPicker(openPicker === "recurrence" ? null : "recurrence")}
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="sheet-description" className="block text-sm font-medium text-text-primary mb-1">
                Description (optional)
              </label>
              <textarea
                id="sheet-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
                rows={2}
                maxLength={2000}
                placeholder="Notes, context, a link..."
                className="w-full px-3 py-2 border border-border rounded-md text-text-primary placeholder:text-text-muted bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 resize-y"
              />
            </div>

            {/* Habit toggle */}
            <div>
              <label htmlFor="sheet-is-habit" className="inline-flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  id="sheet-is-habit"
                  type="checkbox"
                  checked={isHabit}
                  onChange={(e) => setIsHabit(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-border text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer"
                />
                Track as a daily habit
              </label>
            </div>

            {/* Time log - only shown when editing an existing task */}
            {isEdit && task?.id && (
              <TaskTimeLog taskId={task.id} />
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 min-h-[40px] text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {saving ? (isEdit ? "Saving..." : "Adding...") : isEdit ? "Save" : "Add task"}
            </button>
          </div>
        </form>
      </div>

      {/* Pickers (portal to body via PickerSheet, anchored to their chip). Each picker
          writes the manual field state and strips its token from the title so the
          manual value takes over (parsed-first otherwise). */}
      <DueDatePicker
        open={openPicker === "due"}
        triggerRef={dueRef}
        value={effDeadline}
        onChange={(v) => {
          setDeadline(v);
          clearTokenOfType("date");
        }}
        onClose={() => setOpenPicker(null)}
      />
      <PriorityPicker
        open={openPicker === "priority"}
        triggerRef={priorityRef}
        value={effPriority}
        onChange={(p) => {
          setPriority(p);
          clearTokenOfType("priority");
        }}
        onClose={() => setOpenPicker(null)}
      />
      <ProjectPicker
        open={openPicker === "project"}
        triggerRef={projectRef}
        value={effProjectId}
        projects={projects}
        onChange={(id) => {
          setProjectId(id);
          clearTokenOfType("project");
        }}
        onClose={() => setOpenPicker(null)}
      />
      <LabelPicker
        open={openPicker === "label"}
        triggerRef={labelRef}
        allLabels={labels}
        selectedIds={selectedLabelIds}
        onToggle={toggleLabel}
        onCreate={handleLabelCreate}
        onClose={() => setOpenPicker(null)}
      />
      <PickerSheet
        open={openPicker === "recurrence"}
        triggerRef={recurrenceRef}
        title={isHabit ? "Schedule" : "Repeat"}
        onClose={() => setOpenPicker(null)}
      >
        {isHabit ? (
          // Habit schedule: pick ONE mode. Specific days reuses the recurrence builder
          // (un-gated - a habit needs no deadline); x-times-a-week is a 1-7 stepper.
          <div className="space-y-4">
            <div className="flex gap-2" role="group" aria-label="Schedule mode">
              <button
                type="button"
                onClick={() => setScheduleMode("days")}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
                  scheduleMode === "days"
                    ? "bg-primary text-white border-primary"
                    : "border-border text-text-muted hover:text-text-primary"
                }`}
              >
                Specific days
              </button>
              <button
                type="button"
                onClick={() => {
                  // Switching to frequency clears any specific-days recurrence (and its token).
                  setRecurrence(null);
                  clearTokenOfType("recurrence");
                  setScheduleMode("frequency");
                }}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
                  scheduleMode === "frequency"
                    ? "bg-primary text-white border-primary"
                    : "border-border text-text-muted hover:text-text-primary"
                }`}
              >
                x times a week
              </button>
            </div>

            {scheduleMode === "days" ? (
              <RecurrencePicker
                value={effRecurrence}
                onChange={(r) => {
                  setRecurrence(r);
                  clearTokenOfType("recurrence");
                }}
                deadline={effDeadline ?? undefined}
                isHabit
              />
            ) : (
              <div>
                <p className="text-sm text-text-muted mb-2">How many times per week?</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setWeeklyTarget((n) => Math.max(1, n - 1))}
                    disabled={weeklyTarget <= 1}
                    aria-label="Fewer times per week"
                    className="flex items-center justify-center w-9 h-9 rounded-md border border-border text-text-primary hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    -
                  </button>
                  <span className="min-w-[6ch] text-center text-sm font-medium text-text-primary" aria-live="polite">
                    {weeklyTarget}x / week
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeeklyTarget((n) => Math.min(7, n + 1))}
                    disabled={weeklyTarget >= 7}
                    aria-label="More times per week"
                    className="flex items-center justify-center w-9 h-9 rounded-md border border-border text-text-primary hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Check in on any days - the streak counts weeks you hit the target.
                </p>
              </div>
            )}
          </div>
        ) : (
          <RecurrencePicker
            value={effRecurrence}
            onChange={(r) => {
              setRecurrence(r);
              clearTokenOfType("recurrence");
            }}
            deadline={effDeadline ?? undefined}
          />
        )}
      </PickerSheet>
    </div>
  );
}
