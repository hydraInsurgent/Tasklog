"use client";

import { useState, useEffect, useRef } from "react";
import { X, Pencil, Folder, Calendar, Flag, Tag, Repeat, Flame } from "lucide-react";
import {
  Task, Project, Label, Subtask,
  getTask, updateTask, assignTaskProject, setTaskLabels, createLabel,
} from "@/lib/api";
import {
  formatDeadline, deadlineColorClass, labelColor, priorityMeta, describeRecurrence,
} from "@/lib/format";
import { TASKS_CHANGED_EVENT } from "@/contexts/TimeTrackingContext";
import TaskTimeLog from "./TaskTimeLog";
import TaskComments from "./TaskComments";
import SubtaskSection from "./SubtaskSection";
import DueDatePicker from "./pickers/DueDatePicker";
import PriorityPicker from "./pickers/PriorityPicker";
import ProjectPicker from "./pickers/ProjectPicker";
import LabelPicker from "./pickers/LabelPicker";

interface Props {
  task: Task;
  projects: Project[];
  allLabels: Label[];
  onClose: () => void;
  onEdit: (task: Task) => void;
  onSaved: (task: Task) => void;
}

type OpenPicker = null | "due" | "priority" | "project" | "label";

export default function TaskDetailModal({
  task: initialTask,
  projects,
  allLabels: initialLabels,
  onClose,
  onEdit,
  onSaved,
}: Props) {
  const [task, setTask] = useState<Task>(initialTask);
  const [loading, setLoading] = useState(true);
  const [timeRefreshKey, setTimeRefreshKey] = useState(0);
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [labels, setLabels] = useState<Label[]>(initialLabels);
  const backdropRef = useRef<HTMLDivElement>(null);

  const dueTriggerRef = useRef<HTMLButtonElement>(null);
  const priorityTriggerRef = useRef<HTMLButtonElement>(null);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const labelTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTask(initialTask.id)
      .then((t) => { if (!cancelled) { setTask(t); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialTask.id]);

  useEffect(() => {
    const refresh = () => setTimeRefreshKey((k) => k + 1);
    window.addEventListener(TASKS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && openPicker === null) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, openPicker]);

  async function handleProjectChange(projectId: number | null) {
    const updated = await assignTaskProject(task.id, projectId);
    setTask(updated);
    onSaved(updated);
  }

  async function handleDeadlineChange(deadline: string | null) {
    const updated = await updateTask(task.id, { deadline });
    setTask(updated);
    onSaved(updated);
  }

  async function handlePriorityChange(priority: number) {
    const updated = await updateTask(task.id, { priority });
    setTask(updated);
    onSaved(updated);
  }

  async function handleLabelToggle(labelId: number) {
    const currentIds = task.labels.map((l) => l.id);
    const newIds = currentIds.includes(labelId)
      ? currentIds.filter((id) => id !== labelId)
      : [...currentIds, labelId];
    const updated = await setTaskLabels(task.id, newIds);
    setTask(updated);
    onSaved(updated);
  }

  async function handleLabelCreate(name: string) {
    const existing = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      await handleLabelToggle(existing.id);
      return;
    }
    const newLabel = await createLabel(name, 0);
    setLabels((prev) => [...prev, newLabel]);
    const currentIds = task.labels.map((l) => l.id);
    const updated = await setTaskLabels(task.id, [...currentIds, newLabel.id]);
    setTask(updated);
    onSaved(updated);
  }

  // A subtask change (add/tick/deadline/delete/reorder) refreshes the modal's task with the
  // new list + counts, and bubbles up so the underlying card's "2/5" badge stays in sync.
  function handleSubtasksChanged(subtasks: Subtask[]) {
    const updated: Task = {
      ...task,
      subtasks,
      subtaskCount: subtasks.length,
      completedSubtaskCount: subtasks.filter((s) => s.isCompleted).length,
    };
    setTask(updated);
    onSaved(updated);
  }

  const project = projects.find((p) => p.id === task.projectId);
  const pm = priorityMeta(task.priority);
  const selectedLabelIds = task.labels.map((l) => l.id);

  // Shared class for clickable meta rows.
  const metaTriggerClass =
    "text-sm text-text-primary w-full text-left rounded-md px-1.5 py-1 -mx-1.5 -my-1 " +
    "hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 " +
    "transition-colors duration-150 cursor-pointer flex items-center gap-1.5";

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        className="bg-surface w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header: breadcrumb + actions */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Folder size={13} className="text-text-muted shrink-0" aria-hidden="true" />
            {project?.color && (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: project.color }}
              />
            )}
            <span className="text-sm text-text-muted truncate">
              {project ? project.name : "Inbox"}
            </span>
            {task.isHabit && (
              <span className="flex items-center gap-1 text-xs text-amber-500 ml-1">
                <Flame size={12} aria-hidden="true" /> Habit
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-4">
            <button
              onClick={() => onEdit(task)}
              aria-label="Edit task"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 cursor-pointer"
            >
              <Pencil size={12} aria-hidden="true" />
              Edit
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-8 h-8 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded-lg transition-colors duration-150 cursor-pointer"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">

          {/* Left: main content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5 min-w-0">
            <h2
              className={`text-xl font-heading font-semibold text-text-primary leading-snug break-words${
                task.isCompleted ? " line-through opacity-50" : ""
              }`}
            >
              {task.title}
            </h2>

            {task.description ? (
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
                {task.description}
              </p>
            ) : (
              <p className="text-sm text-text-muted italic">No description</p>
            )}

            {/* Subtasks - only once the full task (with its subtasks) has loaded, so we
                don't flash an empty editor over stale list data. */}
            {!loading && (
              <SubtaskSection
                taskId={task.id}
                initialSubtasks={task.subtasks ?? []}
                onSubtasksChanged={handleSubtasksChanged}
              />
            )}

            <TaskTimeLog taskId={task.id} refreshKey={timeRefreshKey} />
          </div>

          {/* Right: editable metadata sidebar */}
          <div className="border-t md:border-t-0 md:border-l border-border px-5 py-4 md:w-56 shrink-0 overflow-y-auto">

            {/* Project */}
            <MetaRow icon={<Folder size={14} />} label="Project">
              <button
                ref={projectTriggerRef}
                type="button"
                onClick={() => setOpenPicker(openPicker === "project" ? null : "project")}
                aria-label="Change project"
                className={metaTriggerClass}
              >
                {project?.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                )}
                <span>{project ? project.name : "Inbox"}</span>
              </button>
              <ProjectPicker
                open={openPicker === "project"}
                triggerRef={projectTriggerRef}
                value={task.projectId}
                projects={projects}
                onChange={(id) => {
                  setOpenPicker(null);
                  handleProjectChange(id);
                }}
                onClose={() => setOpenPicker(null)}
              />
            </MetaRow>

            {/* Due date */}
            <MetaRow icon={<Calendar size={14} />} label="Due date">
              <button
                ref={dueTriggerRef}
                type="button"
                onClick={() => setOpenPicker(openPicker === "due" ? null : "due")}
                aria-label="Change due date"
                className={metaTriggerClass}
              >
                {task.deadline ? (
                  <span className={deadlineColorClass(task.deadline)}>
                    {formatDeadline(task.deadline)}
                  </span>
                ) : (
                  <span className="text-text-muted">No due date</span>
                )}
              </button>
              <DueDatePicker
                open={openPicker === "due"}
                triggerRef={dueTriggerRef}
                value={task.deadline}
                onChange={(d) => {
                  handleDeadlineChange(d);
                  setOpenPicker(null);
                }}
                onClose={() => setOpenPicker(null)}
              />
            </MetaRow>

            {/* Priority */}
            <MetaRow icon={<Flag size={14} />} label="Priority">
              <button
                ref={priorityTriggerRef}
                type="button"
                onClick={() => setOpenPicker(openPicker === "priority" ? null : "priority")}
                aria-label="Change priority"
                className={metaTriggerClass}
              >
                {pm.dotColor && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: pm.dotColor }}
                  />
                )}
                <span>{pm.name}</span>
              </button>
              <PriorityPicker
                open={openPicker === "priority"}
                triggerRef={priorityTriggerRef}
                value={task.priority}
                onChange={(p) => {
                  handlePriorityChange(p);
                  setOpenPicker(null);
                }}
                onClose={() => setOpenPicker(null)}
              />
            </MetaRow>

            {/* Labels */}
            <MetaRow icon={<Tag size={14} />} label="Labels">
              <button
                ref={labelTriggerRef}
                type="button"
                onClick={() => setOpenPicker(openPicker === "label" ? null : "label")}
                aria-label="Change labels"
                className={metaTriggerClass}
              >
                {task.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {task.labels.map((l) => (
                      <span
                        key={l.id}
                        className="text-xs font-medium"
                        style={{ color: labelColor(l.colorIndex) }}
                      >
                        #{l.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-text-muted">None</span>
                )}
              </button>
              <LabelPicker
                open={openPicker === "label"}
                triggerRef={labelTriggerRef}
                allLabels={labels}
                selectedIds={selectedLabelIds}
                onToggle={handleLabelToggle}
                onCreate={handleLabelCreate}
                onClose={() => setOpenPicker(null)}
              />
            </MetaRow>

            {task.recurrence && (
              <MetaRow icon={<Repeat size={14} />} label="Repeats">
                <span className="text-xs text-text-primary">{describeRecurrence(task.recurrence)}</span>
              </MetaRow>
            )}
          </div>
        </div>

        {/* Comments - full width below the two columns */}
        {!loading && (
          <div className="border-t border-border shrink-0 max-h-64 overflow-y-auto">
            <TaskComments taskId={task.id} initialComments={task.comments ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-b-0">
      <span className="mt-0.5 shrink-0 text-text-muted w-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted mb-0.5">{label}</p>
        <div className="text-sm text-text-primary">{children}</div>
      </div>
    </div>
  );
}
