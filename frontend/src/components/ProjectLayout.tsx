"use client";

import { useState, useEffect, useCallback } from "react";
import { Menu, X } from "lucide-react";
import {
  getProjects,
  createProject,
  renameProject,
  deleteProject,
  Project,
} from "@/lib/api";
import ProjectSidebar from "./ProjectSidebar";
import TasksClient from "./TasksClient";

export default function ProjectLayout() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeView, setActiveView] = useState<"all" | "inbox" | number>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Load projects on mount.
  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      // Sidebar will show empty state.
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Create a project and append it to local state.
  async function handleCreateProject(name: string) {
    try {
      const created = await createProject(name);
      setProjects((prev) => [...prev, created]);
    } catch {
      // Swallow for now - feedback in Step 5.
    }
  }

  // Rename a project and update it in local state.
  async function handleEditProject(id: number, name: string) {
    try {
      const updated = await renameProject(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      // Swallow for now - feedback in Step 5.
    }
  }

  // Delete a project and remove it from local state.
  // If the deleted project was the active view, reset to "all".
  async function handleDeleteProject(id: number) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeView === id) setActiveView("all");
    } catch {
      // Swallow for now - feedback in Step 5.
    }
  }

  // When the user picks a view from the sidebar on mobile, also close the drawer.
  function handleSelectView(view: "all" | "inbox" | number) {
    setActiveView(view);
    setDrawerOpen(false);
  }

  const sidebarProps = {
    projects,
    activeView,
    onSelectView: handleSelectView,
    onCreateProject: handleCreateProject,
    onEditProject: handleEditProject,
    onDeleteProject: handleDeleteProject,
  };

  return (
    <div className="flex min-h-screen -mx-4 -my-8">
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-56 bg-white border-r border-zinc-200 shrink-0">
        {loadingProjects ? (
          <div className="px-4 py-6 text-sm text-zinc-400">Loading...</div>
        ) : (
          <ProjectSidebar {...sidebarProps} />
        )}
      </aside>

      {/* Main content area */}
      <div className="flex-1 min-w-0 px-4 py-8">
        {/* Mobile hamburger button */}
        <div className="md:hidden mb-4">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex items-center justify-center p-3 text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-md bg-white cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-1"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>

        <TasksClient activeView={activeView} projects={projects} />
      </div>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-zinc-200 flex flex-col md:hidden transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header with close button */}
        <div className="flex items-center justify-end px-3 py-3 border-b border-zinc-200">
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center p-2 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-1 rounded"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {loadingProjects ? (
          <div className="px-4 py-6 text-sm text-zinc-400">Loading...</div>
        ) : (
          <ProjectSidebar {...sidebarProps} />
        )}
      </div>
    </div>
  );
}
