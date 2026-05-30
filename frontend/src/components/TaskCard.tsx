"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { MoreVertical, Trash2, Loader2, Pencil, Flame } from "lucide-react";
import { Task, Project, Habit } from "@/lib/api";
import { formatDeadline, deadlineColorClass, projectName, labelColor } from "@/lib/format";
import DeadlinePopover from "./DeadlinePopover";
import PriorityDot from "./PriorityDot";
import RecurringBadge from "./RecurringBadge";
import TaskDoneControl from "./TaskDoneControl";
import { occursOn } from "@/lib/recurrence";

interface Props {
  task: Task;
  // Full project list for resolving the task's project name.
  projects: Project[];
  // Controls whether the project name is shown in the card footer.
  // Only shown in the "all tasks" view - consistent with desktop table behavior.
  activeView: "all" | "inbox" | number;
  onComplete: (id: number, isCompleted: boolean) => void;
  onDelete: (id: number) => void;
  // Open the edit modal for this task (handled by the parent).
  onEdit: (task: Task) => void;
  // Quick deadline change from the deadline-pill popover. null clears it.
  onDeadlineChange: (id: number, deadline: string | null) => void;
  // Multi-select support (all optional - off by default). When selectionMode is
  // on, a selection checkbox is shown and tapping it toggles selection.
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  // Which task ID has a delete in flight (disables that card's delete action).
  deletingId: number | null;
  // Which task ID has a completion toggle in flight (disables that card's checkbox).
  completingId: number | null;
  // Whether this card is mid-animation before disappearing from the list.
  isHiding: boolean;
  // Habit support (#73 Habits v2): when the task is a habit, its done-control becomes a
  // daily check-in toggle (never completes/closes it) and a flame marks it.
  habit?: Habit;
  pendingCheckIn?: boolean;
  onCheckInToggle?: (id: number) => void;
}

export default function TaskCard({
  task,
  projects,
  activeView,
  onComplete,
  onDelete,
  onEdit,
  onDeadlineChange,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  deletingId,
  completingId,
  isHiding,
  habit,
  pendingCheckIn = false,
  onCheckInToggle,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDeleting = deletingId === task.id;
  const isCompleting = completingId === task.id;
  // A completed task that is not mid-animation gets the dimmed + strikethrough treatment.
  const isCompletedAndVisible = task.isCompleted && !isHiding;
  const showProject = activeView === "all";
  // A habit that isn't due today (per its schedule) - flag it so the row reads the same
  // as the Habits view, where the check-in is gated to scheduled days.
  const habitNotDueToday = task.isHabit && !occursOn(task.recurrence, new Date());

  // Close the three-dot menu when the user clicks anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    // Listen on both mousedown (desktop) and touchstart (mobile) so the menu
    // closes reliably on touch devices where mousedown may not fire.
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <div
      className={`flex items-center gap-1 px-2 py-3 border-b border-border-muted last:border-b-0${
        isHiding ? " transition-all duration-300 opacity-0 translate-y-1" : " transition-colors duration-150"
      }${isCompletedAndVisible ? " opacity-50" : ""}`}
    >
      {/* Selection checkbox - only shown in multi-select mode. Square, distinct
          from the round completion toggle, so the two actions aren't confused. */}
      {selectionMode && (
        <label className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(task.id)}
            aria-label={`Select "${task.title}"`}
            className="w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent cursor-pointer"
          />
        </label>
      )}

      {/* Done control - habits are checked in (amber ring -> green; dashed when not due
          today), never completed/closed; normal tasks use the round completion checkbox.
          The 44px label gives a comfortable tap target. TaskDoneControl (shared with the
          list + board) owns the habit-vs-task + due-today logic. */}
      {task.isHabit ? (
        <span className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0">
          <TaskDoneControl
            task={task}
            habit={habit}
            completing={isCompleting}
            pendingCheckIn={pendingCheckIn}
            onComplete={onComplete}
            onCheckInToggle={(id) => onCheckInToggle?.(id)}
          />
        </span>
      ) : (
        <label className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={task.isCompleted}
            onChange={(e) => onComplete(task.id, e.target.checked)}
            disabled={isCompleting}
            aria-label={`Mark "${task.title}" as ${task.isCompleted ? "incomplete" : "complete"}`}
            className="appearance-none w-5 h-5 rounded-full border-2 border-border checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 shrink-0 cursor-pointer"
          />
        </label>
      )}

      {/* Card body: title on top, project + deadline below */}
      <div className="flex-1 min-w-0 py-1">
        <Link
          href={`/tasks/${task.id}`}
          className={`flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent focus:outline-none focus:underline transition-colors duration-150 break-words cursor-pointer${
            isCompletedAndVisible ? " line-through" : ""
          }`}
        >
          <PriorityDot priority={task.priority} />
          <span className="min-w-0 break-words">{task.title}</span>
          {task.isHabit && <Flame size={13} className="text-amber-500 shrink-0" aria-label="Habit" />}
        </Link>

        {/* Footer row: project name, deadline, and labels */}
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
          {/* Left side: project name + deadline */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
            {showProject && (
              <span className="text-text-muted">{projectName(task.projectId, projects)}</span>
            )}
            <span className="relative inline-block">
              <button
                type="button"
                onClick={() => setDeadlineOpen((p) => !p)}
                aria-label={`Change deadline for "${task.title}"`}
                className={`rounded px-1 -mx-1 hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-colors duration-150 ${
                  task.deadline ? deadlineColorClass(task.deadline) : "text-zinc-300"
                }`}
              >
                {task.deadline ? formatDeadline(task.deadline) : "No deadline"}
              </button>
              {deadlineOpen && (
                <DeadlinePopover
                  onPick={(d) => onDeadlineChange(task.id, d)}
                  onClose={() => setDeadlineOpen(false)}
                />
              )}
            </span>
            <RecurringBadge recurrence={task.recurrence} />
            {habitNotDueToday && <span className="text-text-muted">Not due today</span>}
          </div>

          {/* Right side: label names shown as #labelname in the label's color.
              Only rendered when the task has at least one label. */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 justify-end">
              {task.labels.map((label) => (
                <span
                  key={label.id}
                  className="text-xs font-medium"
                  style={{ color: labelColor(label.colorIndex) }}
                >
                  #{label.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Three-dot menu - opens a small dropdown with a Delete action only.
          The button itself has a 44px tap target for comfortable mobile use. */}
      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={`Options for "${task.title}"`}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          className="flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer transition-colors duration-150"
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>

        {/* Dropdown menu - positioned below the button, closes on outside click. */}
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-32 bg-surface border border-border rounded-md shadow-md z-10"
          >
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onEdit(task);
              }}
              aria-label={`Edit task: ${task.title}`}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-primary hover:bg-surface-raised focus:outline-none focus:bg-surface-raised cursor-pointer transition-colors duration-150 rounded-md"
            >
              <Pencil size={14} aria-hidden="true" />
              Edit
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete(task.id);
              }}
              disabled={isDeleting}
              aria-label={`Delete task: ${task.title}`}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-danger hover:bg-red-50 focus:outline-none focus:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 rounded-md"
            >
              {isDeleting ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
