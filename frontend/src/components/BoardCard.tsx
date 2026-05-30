"use client";

/* Rich board card (#73 Stage C - the variant chosen in the UI spec): subtle shadow, a
 * due-bucket background tint, a priority pill, the done/check-in control, labels, deadline,
 * and recurring/habit glyphs. Click opens the edit sheet; a hover trash deletes. Trimmed
 * of Tasklog Business's bits we don't have (assignee/status/work-session). */

import { Trash2, Loader2, Flame } from "lucide-react";
import { Task, Project, Habit } from "@/lib/api";
import { priorityMeta, formatDeadline, deadlineColorClass, labelColor } from "@/lib/format";
import TaskDoneControl from "./TaskDoneControl";
import RecurringBadge from "./RecurringBadge";

// Background tint by due urgency (only while not completed). Overdue red, today amber.
const DUE_TINT: Record<Task["dueStatus"], string> = {
  overdue: "bg-danger-bg",
  today: "bg-warning-bg",
  this_week: "bg-surface",
  later: "bg-surface",
  none: "bg-surface",
};

interface Props {
  task: Task;
  projects: Project[];
  habit?: Habit;
  completing?: boolean;
  deleting?: boolean;
  pendingCheckIn?: boolean;
  onComplete: (id: number, isCompleted: boolean) => void;
  onCheckInToggle: (id: number) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
}

export default function BoardCard({
  task,
  habit,
  completing,
  deleting,
  pendingCheckIn,
  onComplete,
  onCheckInToggle,
  onEdit,
  onDelete,
}: Props) {
  const meta = priorityMeta(task.priority);
  const tint = task.isCompleted ? "bg-surface" : DUE_TINT[task.dueStatus];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEdit(task);
      }}
      className={`group relative rounded-lg border border-border shadow-sm hover:shadow-md ${tint} p-3 flex flex-col gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 transition-shadow duration-150 ${
        task.isCompleted ? "opacity-60" : ""
      }`}
    >
      {/* Row 1: done/check-in control + title + priority pill */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          <TaskDoneControl
            task={task}
            habit={habit}
            completing={completing}
            pendingCheckIn={pendingCheckIn}
            onComplete={onComplete}
            onCheckInToggle={onCheckInToggle}
          />
        </span>
        <span className={`flex-1 text-sm font-medium text-text-primary break-words ${task.isCompleted ? "line-through" : ""}`}>
          {task.title}
        </span>
        {task.priority !== 4 && (
          <span
            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color: meta.dotColor ?? undefined, backgroundColor: meta.dotColor ? `${meta.dotColor}1a` : undefined }}
          >
            {meta.label}
          </span>
        )}
      </div>

      {/* Row 2: habit/recurring glyphs + labels + deadline */}
      {(task.isHabit || task.recurrence || task.labels.length > 0 || task.deadline) && (
        <div className="flex items-center gap-2 flex-wrap pl-7 text-xs">
          {task.isHabit && <Flame size={12} className="text-amber-500" aria-hidden="true" />}
          <RecurringBadge recurrence={task.recurrence} />
          {task.labels.map((l) => (
            <span key={l.id} className="font-medium" style={{ color: labelColor(l.colorIndex) }}>
              #{l.name}
            </span>
          ))}
          {task.deadline && (
            <span className={`ml-auto ${deadlineColorClass(task.deadline)}`}>{formatDeadline(task.deadline)}</span>
          )}
        </div>
      )}

      {/* Hover delete */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        disabled={deleting}
        aria-label={`Delete task: ${task.title}`}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-7 h-7 text-text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger rounded transition-opacity duration-150 cursor-pointer disabled:opacity-30"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
      </button>
    </div>
  );
}
