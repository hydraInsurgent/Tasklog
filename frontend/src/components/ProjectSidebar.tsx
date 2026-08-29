"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Pencil, Trash2, Plus, Tag, Clock, Inbox, LayoutList, BookOpen, GripVertical, Users, ChevronRight,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Project, Client, Habit } from "@/lib/api";
import SidebarHabits from "./SidebarHabits";
import ColorPickerButton from "./ColorPickerButton";

// The fields an edit can change. clientId: null clears (Ungrouped); undefined keeps.
type ProjectEditFields = { name?: string; color?: string | null; clientId?: number | null };

interface Props {
  projects: Project[];
  clients: Client[];
  activeView: "all" | "inbox" | number;
  onSelectView: (view: "all" | "inbox" | number) => void;
  onCreateProject: (name: string, color?: string | null, clientId?: number | null) => Promise<void>;
  onEditProject: (id: number, fields: ProjectEditFields) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  onReorderProjects: (orderedIds: number[]) => Promise<void>;
  onCreateClient: (name: string, color?: string | null) => Promise<void>;
  onEditClient: (id: number, name: string, color?: string | null) => Promise<void>;
  onDeleteClient: (id: number) => Promise<void>;
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
  clients,
  activeView,
  onSelectView,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  onReorderProjects,
  onCreateClient,
  onEditClient,
  onDeleteClient,
  habits,
  pendingCheckIns,
  onCheckInToggle,
}: Props) {
  const pathname = usePathname();
  const [showNewInput, setShowNewInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<{ id: number; name: string } | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const sensors = useSensors(
    // A small activation distance so a tap still selects the project; only a drag reorders.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  async function handleEdit(id: number, fields: ProjectEditFields) {
    setPendingId(id);
    try {
      await onEditProject(id, fields);
      setEditingProject(null);
    } catch {
      // Parent handles feedback.
    } finally {
      setPendingId(null);
    }
  }

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderProjects(arrayMove(ids, oldIndex, newIndex));
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

        {/* Drag-sortable flat list, ordered by Position. Rows carry a client chip so the
            grouping is visible without nesting; All Tasks / Inbox above are pinned. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col px-2 space-y-0.5">
              {projects.map((project) => (
                <SortableProjectRow
                  key={project.id}
                  project={project}
                  active={activeView === project.id}
                  onSelect={() => onSelectView(project.id)}
                  onEdit={() => setEditingProject(project)}
                  onDelete={() => setDeletingProject({ id: project.id, name: project.name })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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
                className="flex-1 min-w-0 px-3 py-2 border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
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
          className="mx-4 mt-1 flex items-center gap-2 text-sm text-text-muted hover:text-text-primary cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded-lg px-2 py-1.5"
        >
          <Plus size={15} aria-hidden="true" />
          Add project
        </button>

        {/* Clients (life areas) manager - collapsible to keep the narrow sidebar tidy. */}
        <ClientsManager
          clients={clients}
          onCreate={onCreateClient}
          onEdit={onEditClient}
          onDelete={onDeleteClient}
        />

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

          <Link
            href="/journal"
            className={`flex items-center gap-2.5 w-full text-left text-sm px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${
              pathname === "/journal" ? activeNavClass : inactiveNavClass
            }`}
          >
            <BookOpen size={15} aria-hidden="true" />
            Journal
          </Link>
        </div>

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
          clients={clients}
          onSave={(fields) => handleEdit(editingProject.id, fields)}
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
// Sortable project row
// ---------------------------------------------------------------------------

function SortableProjectRow({
  project, active, onSelect, onEdit, onDelete,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center rounded-lg transition-colors duration-150 ${
        active ? activeNavClass : inactiveNavClass
      }`}
    >
      {/* Drag handle - only affordance that starts a drag; the row itself still taps to select. */}
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder project: ${project.name}`}
        className="flex items-center justify-center w-6 h-11 shrink-0 text-text-muted/50 hover:text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing touch-none focus:outline-none focus:ring-2 focus:ring-accent rounded"
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>

      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm pr-1 py-2 cursor-pointer"
      >
        {/* Project color dot (#77); a hollow ring when no color is set. */}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
          style={project.color ? { backgroundColor: project.color, borderColor: project.color } : undefined}
          aria-hidden="true"
        />
        <span className="min-w-0 flex flex-col leading-tight">
          <span className="truncate">{project.name}</span>
          {project.client && (
            <span className="flex items-center gap-1 text-[10px] text-text-muted truncate">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: project.client.color ?? "var(--color-text-muted)" }}
                aria-hidden="true"
              />
              {project.client.name}
            </span>
          )}
        </span>
      </button>

      {/* Edit button */}
      <button
        onClick={onEdit}
        aria-label={`Edit project: ${project.name}`}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-text-primary focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer"
      >
        <Pencil size={14} aria-hidden="true" />
      </button>

      {/* Delete button */}
      <button
        onClick={onDelete}
        aria-label={`Delete project: ${project.name}`}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center min-w-[44px] min-h-[44px] text-text-muted hover:text-danger focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded transition-colors duration-150 cursor-pointer mr-1"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients manager (collapsible)
// ---------------------------------------------------------------------------

function ClientsManager({
  clients, onCreate, onEdit, onDelete,
}: {
  clients: Client[];
  onCreate: (name: string, color?: string | null) => Promise<void>;
  onEdit: (id: number, name: string, color?: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await onCreate(trimmed, newColor);
      setNewName("");
      setNewColor(null);
      setShowNew(false);
    } catch {
      /* parent feedback */
    }
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mx-2 w-[calc(100%-1rem)] flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary px-3 py-1.5 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        <Users size={13} aria-hidden="true" />
        Clients
        {clients.length > 0 && <span className="text-text-muted/60">({clients.length})</span>}
      </button>

      {open && (
        <div className="px-2 mt-1 space-y-0.5">
          {clients.map((client) => (
            <div
              key={client.id}
              className="group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-surface-raised"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 border border-border"
                style={client.color ? { backgroundColor: client.color, borderColor: client.color } : undefined}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 truncate">{client.name}</span>
              <button
                onClick={() => setEditing(client)}
                aria-label={`Edit client: ${client.name}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center min-w-[36px] min-h-[36px] text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer"
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                onClick={() => setDeleting(client)}
                aria-label={`Delete client: ${client.name}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center min-w-[36px] min-h-[36px] text-text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-accent rounded cursor-pointer"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          ))}

          {showNew ? (
            <div className="flex items-center gap-2 px-2 pt-1">
              <ColorPickerButton value={newColor} onChange={setNewColor} size="sm" />
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setShowNew(false); setNewName(""); setNewColor(null); }
                }}
                placeholder="Client name"
                className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-2 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setShowNew(true); setNewName(""); }}
              className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary cursor-pointer px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
            >
              <Plus size={14} aria-hidden="true" />
              Add client
            </button>
          )}
        </div>
      )}

      {editing && (
        <EditClientModal
          client={editing}
          onSave={async (name, color) => { await onEdit(editing.id, name, color); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteClientDialog
          client={deleting}
          onConfirm={async () => { await onDelete(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit project modal (name + color + client)
// ---------------------------------------------------------------------------

function EditProjectModal({
  project, clients, onSave, onCancel,
}: {
  project: Project;
  clients: Client[];
  onSave: (fields: ProjectEditFields) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState<string | null>(project.color);
  const [clientId, setClientId] = useState<number | null>(project.clientId);

  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), color, clientId });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text-primary mb-4 font-heading">Edit Project</h2>

        <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
        <div className="flex items-center gap-2 mb-4">
          <ColorPickerButton value={color} onChange={setColor} />
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
            className="flex-1 px-3 py-2 border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        <label htmlFor="project-client" className="block text-xs font-medium text-text-muted mb-1">Client</label>
        <select
          id="project-client"
          value={clientId ?? ""}
          onChange={(e) => setClientId(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full mb-5 px-3 py-2 border border-border rounded-md text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer"
        >
          <option value="">Ungrouped</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-border rounded-md cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Cancel
          </button>
          <button
            onClick={save}
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
// Edit client modal (name + color)
// ---------------------------------------------------------------------------

function EditClientModal({
  client, onSave, onCancel,
}: {
  client: Client;
  onSave: (name: string, color: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [color, setColor] = useState<string | null>(client.color);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text-primary mb-4 font-heading">Edit Client</h2>
        <div className="flex items-center gap-2 mb-5">
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
// Delete confirmation dialogs
// ---------------------------------------------------------------------------

function DeleteProjectDialog({
  project, isPending, onConfirm, onCancel,
}: {
  project: { id: number; name: string };
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text-primary mb-2 font-heading">Delete project?</h2>
        <p className="text-sm text-text-muted mb-6">
          Deleting <strong>{project.name}</strong> will permanently delete all tasks inside it.
          This cannot be undone. (Any time tracked against it is kept, just ungrouped.)
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
            className="px-4 py-2 text-sm bg-danger text-white rounded-md hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteClientDialog({
  client, onConfirm, onCancel,
}: {
  client: Client;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text-primary mb-2 font-heading">Delete client?</h2>
        <p className="text-sm text-text-muted mb-6">
          Deleting <strong>{client.name}</strong> keeps its projects - they just become
          Ungrouped. Nothing is lost.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-border rounded-md cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Cancel
          </button>
          <button
            onClick={() => { setPending(true); onConfirm(); }}
            disabled={pending}
            className="px-4 py-2 text-sm bg-danger text-white rounded-md hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
