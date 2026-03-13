"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignTaskProject, Project } from "@/lib/api";

interface Props {
  taskId: number;
  currentProjectId: number | null;
  projects: Project[];
}

// Dropdown that lets the user move a task to a different project (or back to Inbox).
// After saving, calls router.refresh() so the Server Component re-fetches updated data.
export default function AssignProjectButton({ taskId, currentProjectId, projects }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // "inbox" is the sentinel string for null (no project).
  const [selected, setSelected] = useState<string>(
    currentProjectId != null ? String(currentProjectId) : "inbox"
  );

  async function handleChange(value: string) {
    setError("");
    const projectId = value === "inbox" ? null : parseInt(value, 10);
    setPending(true);
    try {
      await assignTaskProject(taskId, projectId);
      // Only update the displayed value after the server confirms the change.
      setSelected(value);
      router.refresh();
    } catch {
      setError("Failed to update project. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
        aria-label="Assign to project"
        className="px-3 py-2 border border-zinc-200 rounded-md text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-shadow duration-150 cursor-pointer bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="inbox">Inbox</option>
        {projects.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
