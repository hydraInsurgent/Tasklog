"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Undo2, FolderInput, CalendarClock, X, Loader2 } from "lucide-react";
import { Project } from "@/lib/api";
import DeadlinePopover from "./DeadlinePopover";

interface Props {
  // How many tasks are currently selected (the bar only renders when > 0).
  count: number;
  // Project list for the "Move to project" dropdown.
  projects: Project[];
  // True while a bulk request is in flight - disables every action.
  busy: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  // null moves the selection to Inbox.
  onMoveToProject: (projectId: number | null) => void;
  // null clears the deadline on the selection.
  onSetDeadline: (deadline: string | null) => void;
  // Exit selection mode / clear the selection.
  onCancel: () => void;
}

// A sticky bar at the bottom of the viewport shown while tasks are selected in
// select mode. Mirrors the single-task actions (complete, move, deadline) but
// applies them to the whole selection in one call. Deliberately no bulk delete.
export default function BulkActionsBar({
  count,
  projects,
  busy,
  onComplete,
  onUncomplete,
  onMoveToProject,
  onSetDeadline,
  onCancel,
}: Props) {
  // Which sub-popover is open ("project" | "deadline" | null).
  const [openMenu, setOpenMenu] = useState<"project" | "deadline" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close any open sub-popover on outside click or Escape.
  useEffect(() => {
    if (!openMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    function onOutside(e: MouseEvent | TouchEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [openMenu]);

  const actionBtn =
    "flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150";

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto max-w-5xl px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-700 mr-1">
          {busy && <Loader2 size={14} className="inline mr-1 animate-spin" aria-hidden="true" />}
          {count} selected
        </span>

        <button
          type="button"
          onClick={onComplete}
          disabled={busy}
          className={`${actionBtn} text-green-700 hover:bg-green-50 focus:ring-green-600`}
        >
          <Check size={16} aria-hidden="true" /> Complete
        </button>

        <button
          type="button"
          onClick={onUncomplete}
          disabled={busy}
          className={`${actionBtn} text-zinc-600 hover:bg-zinc-100 focus:ring-zinc-500`}
        >
          <Undo2 size={16} aria-hidden="true" /> Reopen
        </button>

        {/* Move to project - opens a small dropdown of Inbox + each project. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "project" ? null : "project")}
            disabled={busy}
            aria-haspopup="true"
            aria-expanded={openMenu === "project"}
            className={`${actionBtn} text-zinc-600 hover:bg-zinc-100 focus:ring-zinc-500`}
          >
            <FolderInput size={16} aria-hidden="true" /> Move to project
          </button>
          {openMenu === "project" && (
            <div
              role="menu"
              className="absolute left-0 bottom-full mb-1 w-48 max-h-64 overflow-y-auto bg-white border border-zinc-200 rounded-md shadow-md py-1"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  onMoveToProject(null);
                }}
                className="block w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 cursor-pointer"
              >
                Inbox
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    onMoveToProject(p.id);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 cursor-pointer"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Set deadline - reuses the same preset popover as the single-task pill. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "deadline" ? null : "deadline")}
            disabled={busy}
            aria-haspopup="true"
            aria-expanded={openMenu === "deadline"}
            className={`${actionBtn} text-zinc-600 hover:bg-zinc-100 focus:ring-zinc-500`}
          >
            <CalendarClock size={16} aria-hidden="true" /> Set deadline
          </button>
          {openMenu === "deadline" && (
            <div className="absolute left-0 bottom-full mb-1">
              <DeadlinePopover
                onPick={(d) => {
                  setOpenMenu(null);
                  onSetDeadline(d);
                }}
                onClose={() => setOpenMenu(null)}
              />
            </div>
          )}
        </div>

        {/* Exit selection mode. Pushed to the right on wide screens. */}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancel selection"
          className={`${actionBtn} text-zinc-500 hover:bg-zinc-100 focus:ring-zinc-500 sm:ml-auto`}
        >
          <X size={16} aria-hidden="true" /> Cancel
        </button>
      </div>
    </div>
  );
}
