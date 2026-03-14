"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { MoreVertical, Trash2, Loader2 } from "lucide-react";
import { Task, Project } from "@/lib/api";
import { formatDate, deadlineColorClass, projectName } from "@/lib/format";

interface Props {
  task: Task;
  // Full project list for resolving the task's project name.
  projects: Project[];
  // Controls whether the project name is shown in the card footer.
  // Only shown in the "all tasks" view - consistent with desktop table behavior.
  activeView: "all" | "inbox" | number;
  onComplete: (id: number, isCompleted: boolean) => void;
  onDelete: (id: number) => void;
  // Which task ID has a delete in flight (disables that card's delete action).
  deletingId: number | null;
  // Which task ID has a completion toggle in flight (disables that card's checkbox).
  completingId: number | null;
  // Whether this card is mid-animation before disappearing from the list.
  isHiding: boolean;
}

export default function TaskCard({
  task,
  projects,
  activeView,
  onComplete,
  onDelete,
  deletingId,
  completingId,
  isHiding,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDeleting = deletingId === task.id;
  const isCompleting = completingId === task.id;
  // A completed task that is not mid-animation gets the dimmed + strikethrough treatment.
  const isCompletedAndVisible = task.isCompleted && !isHiding;
  const showProject = activeView === "all";

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
      className={`flex items-center gap-1 px-2 py-3 border-b border-zinc-100 last:border-b-0${
        isHiding ? " transition-all duration-300 opacity-0 translate-y-1" : " transition-colors duration-150"
      }${isCompletedAndVisible ? " opacity-50" : ""}`}
    >
      {/* Circle checkbox - label provides the 44px tap target around a 20px visual circle.
          appearance-none removes native styling; checked:bg-zinc-900 fills it on completion. */}
      <label className="flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 cursor-pointer">
        <input
          type="checkbox"
          checked={task.isCompleted}
          onChange={(e) => onComplete(task.id, e.target.checked)}
          disabled={isCompleting}
          aria-label={`Mark "${task.title}" as ${task.isCompleted ? "incomplete" : "complete"}`}
          className="appearance-none w-5 h-5 rounded-full border-2 border-zinc-300 checked:bg-zinc-900 checked:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 shrink-0 cursor-pointer"
        />
      </label>

      {/* Card body: title on top, project + deadline below */}
      <div className="flex-1 min-w-0 py-1">
        <Link
          href={`/tasks/${task.id}`}
          className={`block text-sm font-medium text-zinc-900 hover:text-blue-600 focus:outline-none focus:underline transition-colors duration-150 break-words cursor-pointer${
            isCompletedAndVisible ? " line-through" : ""
          }`}
        >
          {task.title}
        </Link>

        {/* Footer row: project name and deadline */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-xs">
          {showProject && (
            <span className="text-zinc-500">{projectName(task.projectId, projects)}</span>
          )}
          {task.deadline ? (
            <span className={deadlineColorClass(task.deadline)}>
              {formatDate(task.deadline)}
            </span>
          ) : (
            <span className="text-zinc-300">No deadline</span>
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
          className="flex items-center justify-center min-w-[44px] min-h-[44px] text-zinc-400 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-1 rounded cursor-pointer transition-colors duration-150"
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>

        {/* Dropdown menu - positioned below the button, closes on outside click. */}
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-32 bg-white border border-zinc-200 rounded-md shadow-md z-10"
          >
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete(task.id);
              }}
              disabled={isDeleting}
              aria-label={`Delete task: ${task.title}`}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 focus:outline-none focus:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 rounded-md"
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
