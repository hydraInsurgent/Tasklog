"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pencil, Trash2, Plus, Tag, Clock, Inbox, LayoutList } from "lucide-react";
import { Project, Habit } from "@/lib/api";
import SidebarHabits from "./SidebarHabits";
import ColorPickerButton from "./ColorPickerButton";

interface Props {
  projects: Project[];
  activeView: "all" | "inbox" | number;
  onSelectView: (view: "all" | "inbox" | number) => void;
  onCreateProject: (name: string, color?: string | null) => Promise<void>;
  onEditProject: (id: number, name: string, color?: string | null) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  // Habits shown as a compact check-in section below "Add project" (#76).
  habits?: Habit[];
  pendingCheckIns?: Set<number>;
  onCheckInToggle?: (taskId: number) => void;
}

// Pill-style nav item classes.
const activeNavClass = "bg-accent/10 text-accent font-semibold";
const inactiveNavClass = "text-text-muted hover:text-text-primary hover:bg-surface-raised";

export default function ProjectSidebar({
  projects,
  activeView,
  onSelectView,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  habits,
  pendingCheckIns,
  onCheckInToggle,
}: Props) {
  const pathname = usePathname();
  const [showNewInput, setShowNewInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<{
    id: number;
    name: string;
    color: string | null;
  } | null>(null);
  const [deletingProject, setDeletingProject] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  // Wrap create with pending state management.
  async function handleCreate() {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    try {
      await onCreateProject(trimmed, newProjectColor);
      setNewProjectName("");
      setNewProjectColor(null);
      setShowNewInput(false);
    } catch {
      // Parent handles feedback.
    }
  }

  // Wrap edit with pending state management.
  async function handleEdit(id: number, name: string, color: string | null) {
    setPendingId(id);
    try {
      await onEditProject(id, name, color);
      setEditingProject(null);
    } catch {
      // Parent handles feedback.
    } finally {
      setPendingId(null);
    }
  }

  // Wrap delete with pending state management.
  async function handleDelete(id: number) {
    setPendingId(id);
    try {
      await onDeleteProject(id);
      setDeletingProject(null);
    } catch {
      // Parent handles feedback.
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {/* Sidebar nav */}
      <nav className="flex flex-col h-full py-4">
        {/* Fixed items */}
        <div className="px-2 space-y-0.5">
          <button
            onClick={() => onSelectView("all")}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2.5 transition-colors duration-150 cursor-pointer ${
              activeView === "all" ? activeNavClass : inactiveNavClass
            }`}
          >
            <LayoutList size={15} aria-hidden="true" />
            All Tasks
          </button>
          <button
            onClick={() => onSelectView("inbox")}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2.5 transition-colors duration-150 cursor-pointer ${
              activeView === "inbox" ? activeNavClass : inactiveNavClass
            }`}
          >
            <Inbox size={15} aria-hidden="true" />
            Inbox
          </button>
        </div>

        <hr className="my-3 border-border mx-2" />

        {/* Projects section */}
        <p className="px-5 mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Projects
        </p>

        <div className="flex flex-col px-2 space-y-0.5">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`group flex items-center gap-0.5 rounded-lg transition-colors duration-150 ${
                activeView === project.id ? activeNavClass : inactiveNavClass
              }`}
            >
              <button
                onClick={() => onSelectView(project.id)}
                className="flex-1 flex items-center gap-2 text-left text-sm px-3 py-2 cursor-pointer"
              >
                {/* Project color dot (#77); a hollow ring when no color is set. */}
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                  style={project.color ? { backgroundColor: project.color, borderColor: project.color } : undefined}
                  aria-hidden="true"
                />
                {project.name}
              </button>

              {/* Edit button */}
              <button
                onClick={() =>
                  setEditingProject({ id: project.id, name: project.name, color: project.color })
                }
                aria-label={`Edit project: ${project.name}`}
                className="opacity-0 group-hover:opacity-100 flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer"
              >
                <Pencil size={14} aria-hidden="true" />
              </button>

              {/* Delete button */}
              <button
                onClick={() =>
                  setDeletingProject({ id: project.id, name: project.name })
                }
                aria-label={`Delete project: ${project.name}`}
                className="opacity-0 group-hover:opacity-100 flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-danger focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer mr-1"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <hr className="my-3 border-border mx-2" />

        {/* Labels + Time links */}
        <div className="px-2 space-y-0.5">
          <Link
            href="/labels"
            className={`flex items-center gap-2.5 w-full text-left text-sm px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
              pathname === "/labels" ? activeNavClass : inactiveNavClass
            }`}
          >
            <Tag size={15} aria-hidden="true" />
            Labels
          </Link>

          <Link
            href="/time"
            className={`flex items-center gap-2.5 w-full text-left text-sm px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
              pathname === "/time" ? activeNavClass : inactiveNavClass
            }`}
          >
            <Clock size={15} aria-hidden="true" />
            Time
          </Link>
        </div>

        <hr className="my-3 border-border mx-2" />

        {/* Inline new project input + color picker (#77) */}
        {showNewInput && (
          <div className="px-4 mt-2">
            <div className="flex items-center gap-2">
              <ColorPickerButton value={newProjectColor} onChange={setNewProjectColor} size="sm" />
              <input
                autoFocus
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setShowNewInput(false);
                    setNewProjectName("");
                    setNewProjectColor(null);
                  }
                }}
                placeholder="Project name"
                className="flex-1 px-3 py-2 border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
              <button
                onClick={handleCreate}
                disabled={!newProjectName.trim()}
                className="px-2 py-2 text-xs bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Add project button */}
        <button
          onClick={() => {
            setShowNewInput((prev) => !prev);
            setNewProjectName("");
          }}
          className="mx-4 flex items-center gap-2 text-sm text-text-muted hover:text-text-primary cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded-lg px-2 py-1.5"
        >
          <Plus size={15} aria-hidden="true" />
          Add project
        </button>

        {/* Habits: compact due-today check-in section (#76). */}
        {onCheckInToggle && habits && habits.length > 0 && (
          <>
            <hr className="my-3 border-border" />
            <SidebarHabits
              habits={habits}
              pendingCheckIns={pendingCheckIns ?? new Set()}
              onCheckInToggle={onCheckInToggle}
            />
          </>
        )}
      </nav>

      {/* Edit modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onSave={(name, color) => handleEdit(editingProject.id, name, color)}
          onCancel={() => setEditingProject(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deletingProject && (
        <DeleteProjectDialog
          project={deletingProject}
          isPending={pendingId === deletingProject.id}
          onConfirm={() => handleDelete(deletingProject.id)}
          onCancel={() => setDeletingProject(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

function EditProjectModal({
  project,
  onSave,
  onCancel,
}: {
  project: { id: number; name: string; color: string | null };
  onSave: (name: string, color: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState<string | null>(project.color);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-base font-semibold text-text-primary mb-4"
          style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          Edit Project
        </h2>
        <div className="flex items-center gap-2 mb-4">
          <ColorPickerButton value={color} onChange={setColor} />
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onSave(name.trim(), color);
              if (e.key === "Escape") onCancel();
            }}
            className="flex-1 px-3 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-border rounded-md cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onSave(name.trim(), color)}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteProjectDialog({
  project,
  isPending,
  onConfirm,
  onCancel,
}: {
  project: { id: number; name: string };
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-base font-semibold text-text-primary mb-2"
          style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          Delete project?
        </h2>
        <p className="text-sm text-text-muted mb-6">
          Deleting <strong>{project.name}</strong> will permanently delete all
          tasks inside it. This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-border rounded-md cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
