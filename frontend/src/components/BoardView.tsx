"use client";

/* Board renderer (#73 Stage C). Groups the already-scope+filtered tasks into columns
 * (via the pure groupTasksForBoard helper) and lays them out as fixed-width,
 * horizontally-scrollable columns - so more than ~3.5 columns is discoverable by scroll.
 * It does NOT do its own filtering: it consumes whatever list TasksClient passes (the
 * scope/filter axis stays in TasksClient). */

import { Task, Project, Habit } from "@/lib/api";
import { groupTasksForBoard } from "@/lib/board";
import type { GroupBy } from "./ProjectLayout";
import BoardCard from "./BoardCard";

interface Props {
  tasks: Task[];
  groupBy: GroupBy;
  projects: Project[];
  habitsByTaskId: Map<number, Habit>;
  completingId: number | null;
  deletingId: number | null;
  pendingCheckIns: Set<number>;
  onComplete: (id: number, isCompleted: boolean) => void;
  onCheckInToggle: (id: number) => void;
  onOpen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onToggleSubtask?: (parentTaskId: number, subtaskId: number, isCompleted: boolean) => void;
  onOpenParent?: (subtaskRow: Task) => void;
}

export default function BoardView({
  tasks,
  groupBy,
  projects,
  habitsByTaskId,
  completingId,
  deletingId,
  pendingCheckIns,
  onComplete,
  onCheckInToggle,
  onOpen,
  onEdit,
  onDelete,
  onToggleSubtask,
  onOpenParent,
}: Props) {
  const columns = groupTasksForBoard(tasks, groupBy, projects);

  if (columns.length === 0) {
    return <p className="py-16 text-center text-text-muted text-sm">No tasks to show on the board.</p>;
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain pb-2">
      <div className="flex gap-4" style={{ minWidth: "min-content" }}>
        {columns.map((col) => (
          <section key={col.key} className="w-64 shrink-0 flex flex-col" aria-label={`${col.label} (${col.tasks.length})`}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span
                className={`w-2 h-2 rounded-full ${col.accentColor ? "" : col.accent}`}
                style={col.accentColor ? { backgroundColor: col.accentColor } : undefined}
                aria-hidden="true"
              />
              <h3 className="font-heading text-sm font-semibold text-text-primary">{col.label}</h3>
              <span className="text-xs text-text-muted tabular-nums">{col.tasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.tasks.length === 0 ? (
                <p className="text-xs text-text-muted px-1 py-3">Nothing here</p>
              ) : (
                col.tasks.map((task) => (
                  <BoardCard
                    key={task.isSubtask ? `s-${task.id}` : `t-${task.id}`}
                    task={task}
                    projects={projects}
                    habit={habitsByTaskId.get(task.id)}
                    completing={completingId === task.id}
                    deleting={deletingId === task.id}
                    pendingCheckIn={pendingCheckIns.has(task.id)}
                    onComplete={onComplete}
                    onCheckInToggle={onCheckInToggle}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleSubtask={onToggleSubtask}
                    onOpenParent={onOpenParent}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
