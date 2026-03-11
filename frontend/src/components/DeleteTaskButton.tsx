"use client";

// A Client Component for deleting a task from the detail page.
// After deletion it redirects to the home page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteTask } from "@/lib/api";

interface Props {
  taskId: number;
  taskTitle: string;
}

export default function DeleteTaskButton({ taskId, taskTitle }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      await deleteTask(taskId);
      router.push("/");
    } catch {
      setError("Failed to delete task. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={loading}
        aria-label={`Delete task: ${taskTitle}`}
        className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 size={16} aria-hidden="true" />
        )}
        {loading ? "Deleting..." : "Delete task"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
