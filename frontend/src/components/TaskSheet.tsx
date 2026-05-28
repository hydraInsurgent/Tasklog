"use client";

/* Chip-driven create/edit task sheet (#73). One component for both:
 *   - create: task undefined. Title runs through quick-add parsing on submit
 *     (same as the old AddTaskForm), chips supply the rest.
 *   - edit:   task provided. Title is literal; fields diff against the original
 *     and only what changed is sent (same fan-out as the old EditTaskModal).
 *
 * Layout: centered modal at >=640px, keyboard-aware bottom-sheet below. Each field
 * (due date / priority / project / label / recurrence) is a <Chip> that opens its
 * picker in a <PickerSheet>. Replaces AddTaskForm + EditTaskModal. */

import { useState, useEffect, useRef, FormEvent } from "react";
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
} from "@/lib/api";
import { priorityMeta, formatDeadline, describeRecurrence } from "@/lib/format";
import { parseQuickAdd } from "@/lib/quickAdd";
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

  // --- Form state (seeded from the task on edit, defaults on create) ---
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  // Deadline as an ISO string (date-only "YYYY-MM-DD" or date+time), or null.
  const [deadline, setDeadline] = useState<string | null>(task?.deadline ?? null);
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [projectId, setProjectId] = useState<number | null>(task ? task.projectId : defaultProjectId ?? null);
  // Growable master label list (created labels are appended here).
  const [labels, setLabels] = useState<Label[]>(allLabels);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(task ? task.labels.map((l) => l.id) : []);
  const [recurrence, setRecurrence] = useState<string | null>(task?.recurrence ?? null);
  const [isHabit, setIsHabit] = useState(task?.isHabit ?? false);

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

  // Close on Escape (only when no picker is open - the picker handles its own Escape).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && openPicker === null) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, openPicker]);

  // Live-fill the chips from quick-add tokens in the title (create only). Typing
  // "friday #Work @urgent p1" reflects straight into the Due / Project / Label /
  // Priority chips, so the user sees the capture there (no separate chips row). Only
  // a dimension whose token is present is set, so manual chip edits to other fields
  // survive; on submit the tokens are stripped from the title (cleanedTitle). Labels
  // resolve against existing ones here (autosuggest only offers existing labels);
  // brand-new @names are created on submit.
  useEffect(() => {
    if (isEdit || !title.trim()) return;
    const parsed = parseQuickAdd(title, projects);
    if (parsed.deadline) setDeadline(parsed.deadline);
    if (parsed.priority) setPriority(parsed.priority);
    if (parsed.recurrence) setRecurrence(parsed.recurrence);
    if (parsed.projectName) {
      const match = projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase());
      if (match) setProjectId(match.id);
    }
    if (parsed.labelNames && parsed.labelNames.length > 0) {
      const ids = parsed.labelNames
        .map((n) => labels.find((l) => l.name.toLowerCase() === n.toLowerCase())?.id)
        .filter((x): x is number => x !== undefined);
      if (ids.length > 0) setSelectedLabelIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }, [title, isEdit, projects, labels]);

  // --- Label helpers ---
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
    // Parse the title as a quick-add line; parsed tokens win over the chips (same
    // precedence as the old AddTaskForm).
    const parsed = parseQuickAdd(title, projects);
    const finalTitle = parsed.cleanedTitle || title.trim();
    if (!finalTitle) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    try {
      let finalDeadline = parsed.deadline ?? deadline ?? undefined;
      const finalRecurrence = parsed.recurrence ?? (finalDeadline ? recurrence ?? undefined : undefined);
      // A recurrence needs a deadline anchor - default to today if none was given.
      if (finalRecurrence && !finalDeadline) finalDeadline = resolvePreset("today") ?? undefined;
      const finalPriority = parsed.priority ?? priority;

      let finalProjectId = projectId;
      if (parsed.projectName) {
        const match = projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase());
        if (match) finalProjectId = match.id;
      }

      // Labels: those selected in the picker plus any @tokens in the title.
      const labelObjs: Label[] = selectedLabelIds
        .map((id) => labels.find((l) => l.id === id))
        .filter((l): l is Label => !!l);
      for (const name of parsed.labelNames ?? []) {
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

    const titleChanged = trimmed !== t.title;
    const deadlineChanged = newDeadline !== oldDeadline;
    const priorityChanged = priority !== t.priority;
    const newDescription = description.trim() || null;
    const descriptionChanged = newDescription !== (t.description ?? null);
    const newRecurrence = newDeadline ? recurrence : null; // recurrence needs a deadline
    const recurrenceChanged = newRecurrence !== (t.recurrence ?? null);
    const isHabitChanged = isHabit !== t.isHabit;
    const projectChanged = projectId !== t.projectId;
    const labelsChanged =
      origLabelIds.length !== newLabelIds.length || origLabelIds.some((id, i) => id !== newLabelIds[i]);

    if (
      !titleChanged && !deadlineChanged && !priorityChanged && !descriptionChanged &&
      !recurrenceChanged && !isHabitChanged && !projectChanged && !labelsChanged
    ) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      if (titleChanged || deadlineChanged || priorityChanged || descriptionChanged || recurrenceChanged || isHabitChanged) {
        const body: {
          title?: string;
          deadline?: string | null;
          priority?: number;
          description?: string | null;
          recurrence?: string | null;
          isHabit?: boolean;
        } = {};
        if (titleChanged) body.title = trimmed;
        // Send the deadline whenever recurrence is being set, so the backend sees
        // the anchor in the same PATCH (it processes deadline before recurrence).
        if (deadlineChanged || (recurrenceChanged && newRecurrence)) body.deadline = newDeadline;
        if (priorityChanged) body.priority = priority;
        if (descriptionChanged) body.description = newDescription;
        if (recurrenceChanged) body.recurrence = newRecurrence;
        if (isHabitChanged) body.isHabit = isHabit;
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

  // --- Chip display values ---
  const dueValue = deadline ? formatDeadline(deadline) : undefined;
  const priorityValue = priority !== 4 ? priorityMeta(priority).label : undefined;
  const projectValue = projectId === null ? "Inbox" : projects.find((p) => p.id === projectId)?.name ?? "Inbox";
  const labelValue =
    selectedLabelIds.length > 0
      ? selectedLabelIds.length === 1
        ? labels.find((l) => l.id === selectedLabelIds[0])?.name ?? "1 label"
        : `${selectedLabelIds.length} labels`
      : undefined;
  const recurrenceValue = recurrence ? describeRecurrence(recurrence) : undefined;

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
            {/* Title (quick-add field) */}
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
              />
              {error && (
                <p className="mt-1 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* Chip row */}
            <div className="flex flex-wrap gap-2">
              <Chip
                chipRef={dueRef}
                icon={<Calendar size={16} aria-hidden="true" />}
                label="Due date"
                value={dueValue}
                active={openPicker === "due"}
                disabled={saving}
                onClick={() => setOpenPicker(openPicker === "due" ? null : "due")}
              />
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
                label="Repeat"
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

      {/* Pickers (portal to body via PickerSheet, anchored to their chip) */}
      <DueDatePicker
        open={openPicker === "due"}
        triggerRef={dueRef}
        value={deadline}
        onChange={setDeadline}
        onClose={() => setOpenPicker(null)}
      />
      <PriorityPicker
        open={openPicker === "priority"}
        triggerRef={priorityRef}
        value={priority}
        onChange={setPriority}
        onClose={() => setOpenPicker(null)}
      />
      <ProjectPicker
        open={openPicker === "project"}
        triggerRef={projectRef}
        value={projectId}
        projects={projects}
        onChange={setProjectId}
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
        title="Repeat"
        onClose={() => setOpenPicker(null)}
      >
        <RecurrencePicker value={recurrence} onChange={setRecurrence} deadline={deadline ?? undefined} />
      </PickerSheet>
    </div>
  );
}
