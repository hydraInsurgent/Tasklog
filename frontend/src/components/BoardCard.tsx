"use client";

/* Rich board card (#73 Stage C - the variant chosen in the UI spec): subtle shadow, a
 * due-bucket background tint, a priority pill, the done/check-in control, labels, deadline,
 * and recurring/habit glyphs. Click opens the edit sheet; a hover trash deletes. Trimmed
 * of Tasklog Business's bits we don't have (assignee/status/work-session). */

import { Trash2, Loader2, Flame, ListChecks, CornerDownRight } from "lucide-react";
import { Task, Project, Habit } from "@/lib/api";
import { priorityMeta, formatDeadline, deadlineColorClass, labelColor } from "@/lib/format";
import TaskDoneControl from "./TaskDoneControl";
import TimerControl from "./TimerControl";
import RecurringBadge from "./RecurringBadge";
import SubtaskChecklist from "./SubtaskChecklist";

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
  onOpen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  // For a projected dated-subtask card: toggle the subtask, and open its parent.
  onToggleSubtask?: (parentTaskId: number, subtaskId: number, isCompleted: boolean) => void;
  onSetSubtaskDeadline?: (parentTaskId: number, subtaskId: number, deadline: string | null) => void;
  onOpenParent?: (subtaskRow: Task) => void;
}

export default function BoardCard({
  task,
  habit,
  completing,
  deleting,
  pendingCheckIn,
  onComplete,
  onCheckInToggle,
  onOpen,
  onEdit,
  onDelete,
  onToggleSubtask,
  onSetSubtaskDeadline,
  onOpenParent,
}: Props) {
  const meta = priorityMeta(task.priority);
  const tint = task.isCompleted ? "bg-surface" : DUE_TINT[task.dueStatus];
  // A projected subtask card opens its parent and toggles the subtask, not a task.
  const open = () => (task.isSubtask ? onOpenParent?.(task) : onOpen(task));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
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
            onComplete={
              task.isSubtask
                ? (sid, c) => onToggleSubtask?.(task.parentTaskId!, sid, c)
                : onComplete
            }
            onCheckInToggle={onCheckInToggle}
          />
        </span>
        <div className="flex-1 min-w-0">
          {/* Breadcrumb to the parent, for a projected dated-subtask card. */}
          {task.isSubtask && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted mb-0.5">
              <CornerDownRight size={11} aria-hidden="true" />
              <span className="truncate">{task.parentTitle}</span>
            </span>
          )}
          <span className={`block text-sm font-medium text-text-primary break-words ${task.isCompleted ? "line-through" : ""}`}>
            {task.title}
          </span>
        </div>
        {task.priority !== 4 && (
          <span
            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color: meta.dotColor ?? undefined, backgroundColor: meta.dotColor ? `${meta.dotColor}1a` : undefined }}
          >
            {meta.label}
          </span>
        )}
        {/* Timer play/stop (#77) - hover-reveal. Not on a projected subtask card. */}
        {!task.isSubtask && (
          <span className="shrink-0">
            <TimerControl task={task} />
          </span>
        )}
      </div>

      {/* Row 2: habit/recurring glyphs + subtask progress + labels + deadline */}
      {(task.isHabit || task.recurrence || task.labels.length > 0 || task.deadline || (task.subtaskCount ?? 0) > 0) && (
        <div className="flex items-center gap-2 flex-wrap pl-7 text-xs">
          {task.isHabit && <Flame size={12} className="text-amber-500" aria-hidden="true" />}
          <RecurringBadge recurrence={task.recurrence} />
          {(task.subtaskCount ?? 0) > 0 && (
            <span
              className={`inline-flex items-center gap-0.5 ${
                (task.completedSubtaskCount ?? 0) === task.subtaskCount ? "text-success" : "text-text-muted"
              }`}
              title="Subtask progress"
            >
              <ListChecks size={12} aria-hidden="true" />
              {task.completedSubtaskCount ?? 0}/{task.subtaskCount ?? 0}
            </span>
          )}
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

      {/* Subtasks clubbed inline under the card (tickable), stopping card-click propagation. */}
      {task.subtasks && task.subtasks.length > 0 && (
        <div className="pl-7" onClick={(e) => e.stopPropagation()}>
          <SubtaskChecklist
            subtasks={task.subtasks}
            onToggle={(subtaskId, isCompleted) => onToggleSubtask?.(task.id, subtaskId, isCompleted)}
            onSetDeadline={(subtaskId, deadline) => onSetSubtaskDeadline?.(task.id, subtaskId, deadline)}
            onOpenParent={() => onOpen(task)}
          />
        </div>
      )}

      {/* Hover delete - not on a projected subtask card (managed from its parent). */}
      {!task.isSubtask && (
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
      )}
    </div>
  );
}
