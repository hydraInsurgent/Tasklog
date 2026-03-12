"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { completeTask } from "@/lib/api";

interface Props {
  taskId: number;
  taskTitle: string;
  isCompleted: boolean;
}

export default function CompleteTaskButton({ taskId, taskTitle, isCompleted }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    setLoading(true);
    setError("");
    try {
      await completeTask(taskId, !isCompleted);
      router.refresh();
    } catch {
      setError("Failed to update task. Please try again.");
      setLoading(false);
    }
  }

  const label = isCompleted ? "Mark incomplete" : "Mark complete";

  const colorClasses = isCompleted
    ? "text-green-700 border border-green-200 hover:bg-green-50 focus:ring-green-500"
    : "text-zinc-700 border border-zinc-200 hover:bg-zinc-50 focus:ring-zinc-500";

  return (
    <div>
      <button
        onClick={handleToggle}
        disabled={loading}
        aria-label={`${label}: ${taskTitle}`}
        className={`inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer ${colorClasses}`}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : isCompleted ? (
          <CheckCircle size={16} aria-hidden="true" />
        ) : (
          <Circle size={16} aria-hidden="true" />
        )}
        {loading ? "Saving..." : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
