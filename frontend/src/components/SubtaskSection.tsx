"use client";

/* Full subtask editor for the task detail modal (#78): add, tick, set/clear a deadline,
 * delete, and drag-reorder. Owns the subtask list locally and bubbles every change up so
 * the parent card's "2/5" counts stay in sync. Drag-reorder uses @dnd-kit (touch-friendly).
 *
 * Kept separate from the card's read-only SubtaskChecklist: this is the place for editing,
 * the card is the place for a glance + a quick tick. */

import { useState, useRef } from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Trash2, Calendar, Plus, Loader2 } from "lucide-react";
import { Subtask, createSubtask, toggleSubtask, updateSubtask, deleteSubtask, reorderSubtasks } from "@/lib/api";
import { formatDeadline, deadlineColorClass } from "@/lib/format";
import DueDatePicker from "./pickers/DueDatePicker";

interface Props {
  taskId: number;
  initialSubtasks: Subtask[];
  // Bubbles the current subtask list up so the modal can refresh the parent card's counts.
  // Optional: the standalone detail page (a Server Component) mounts this with no handler.
  onSubtasksChanged?: (subtasks: Subtask[]) => void;
}

export default function SubtaskSection({ taskId, initialSubtasks, onSubtasksChanged }: Props) {
  const [subtasks, setSubtasks] = useState<Subtask[]>(
    [...initialSubtasks].sort((a, b) => a.position - b.position),
  );
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [deadlineOpenId, setDeadlineOpenId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Push the new list to local state AND up to the modal (for the card counts).
  function commit(next: Subtask[]) {
    setSubtasks(next);
    onSubtasksChanged?.(next);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const created = await createSubtask(taskId, title);
      commit([...subtasks, created]);
      setNewTitle("");
    } catch {
      // Leave the input as-is so the user can retry.
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(s: Subtask) {
    const next = subtasks.map((x) => (x.id === s.id ? { ...x, isCompleted: !x.isCompleted } : x));
    commit(next);
    try {
      await toggleSubtask(taskId, s.id, !s.isCompleted);
    } catch {
      commit(subtasks); // revert
    }
  }

  async function handleSetDeadline(s: Subtask, deadline: string | null) {
    setDeadlineOpenId(null);
    const next = subtasks.map((x) => (x.id === s.id ? { ...x, deadline } : x));
    commit(next);
    try {
      await updateSubtask(taskId, s.id, { deadline });
    } catch {
      commit(subtasks);
    }
  }

  async function handleDelete(s: Subtask) {
    const next = subtasks.filter((x) => x.id !== s.id);
    commit(next);
    try {
      await deleteSubtask(taskId, s.id);
    } catch {
      commit(subtasks);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = subtasks;
    const next = arrayMove(subtasks, oldIndex, newIndex);
    commit(next);
    try {
      await reorderSubtasks(taskId, next.map((s) => s.id));
    } catch {
      commit(previous); // revert on failure
    }
  }

  const completed = subtasks.filter((s) => s.isCompleted).length;

  return (
    <section aria-label="Subtasks">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">Subtasks</h3>
        {subtasks.length > 0 && (
          <span className={`text-xs ${completed === subtasks.length ? "text-success" : "text-text-muted"}`}>
            {completed}/{subtasks.length}
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col">
              {subtasks.map((s) => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  deadlineOpen={deadlineOpenId === s.id}
                  onToggle={() => handleToggle(s)}
                  onOpenDeadline={() => setDeadlineOpenId(deadlineOpenId === s.id ? null : s.id)}
                  onPickDeadline={(d) => handleSetDeadline(s, d)}
                  onCloseDeadline={() => setDeadlineOpenId(null)}
                  onDelete={() => handleDelete(s)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add row */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 mt-2">
        <Plus size={14} className="text-text-muted shrink-0" aria-hidden="true" />
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a subtask"
          maxLength={500}
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none border-b border-transparent focus:border-border py-1"
        />
        {newTitle.trim() && (
          <button
            type="submit"
            disabled={adding}
            className="text-xs text-accent hover:underline disabled:opacity-50 cursor-pointer shrink-0"
          >
            {adding ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : "Add"}
          </button>
        )}
      </form>
    </section>
  );
}

function SubtaskRow({
  subtask: s,
  deadlineOpen,
  onToggle,
  onOpenDeadline,
  onPickDeadline,
  onCloseDeadline,
  onDelete,
}: {
  subtask: Subtask;
  deadlineOpen: boolean;
  onToggle: () => void;
  onOpenDeadline: () => void;
  onPickDeadline: (deadline: string | null) => void;
  onCloseDeadline: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  // The date button anchors the DueDatePicker popover (same picker the task's due date uses).
  const dateTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 py-1.5 border-b border-border-muted last:border-b-0"
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Reorder subtask"
        className="text-text-muted/50 hover:text-text-muted cursor-grab active:cursor-grabbing touch-none shrink-0 focus:outline-none focus:ring-2 focus:ring-accent rounded"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>

      {/* Tick */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={s.isCompleted}
        aria-label={`Mark "${s.title}" as ${s.isCompleted ? "incomplete" : "complete"}`}
        className={`flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 ${
          s.isCompleted ? "bg-primary border-primary text-white" : "border-border text-transparent hover:border-primary"
        }`}
      >
        {s.isCompleted && <Check size={10} aria-hidden="true" />}
      </button>

      {/* Title */}
      <span className={`flex-1 min-w-0 text-sm break-words ${s.isCompleted ? "line-through text-text-muted" : "text-text-primary"}`}>
        {s.title}
      </span>

      {/* Deadline: a compact calendar-icon button (with the date when set) that opens the
          same rich due-date picker (quick chips + month calendar + time) as a task. */}
      <span className="shrink-0">
        <button
          ref={dateTriggerRef}
          type="button"
          onClick={onOpenDeadline}
          aria-label={s.deadline ? `Change deadline for "${s.title}"` : `Set a deadline for "${s.title}"`}
          title={s.deadline ? undefined : "Set a date"}
          className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-colors duration-150 ${
            s.deadline ? deadlineColorClass(s.deadline) : "text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100"
          }`}
        >
          <Calendar size={12} aria-hidden="true" />
          {s.deadline && <span>{formatDeadline(s.deadline)}</span>}
        </button>
        <DueDatePicker
          open={deadlineOpen}
          triggerRef={dateTriggerRef}
          value={s.deadline}
          onChange={onPickDeadline}
          onClose={onCloseDeadline}
        />
      </span>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete subtask "${s.title}"`}
        className="text-text-muted/50 hover:text-danger opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-danger rounded transition-colors duration-150"
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
    </li>
  );
}
