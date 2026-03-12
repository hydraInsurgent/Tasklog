// Task detail page. Fetches a single task server-side (Server Component).
// The [id] segment is provided by Next.js App Router dynamic routing.
// DeleteTaskButton and CompleteTaskButton are Client Components for interactive actions.

import Link from "next/link";
import { getTask } from "@/lib/api";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DeleteTaskButton from "@/components/DeleteTaskButton";
import CompleteTaskButton from "@/components/CompleteTaskButton";

// Format an ISO date string to a readable local date (e.g. "12 Mar 2026").
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Returns a Tailwind class for deadline proximity coloring.
function deadlineColorClass(deadline: string | null): string {
  if (!deadline) return "text-zinc-400";
  const diff =
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-red-500 font-semibold";
  if (diff <= 3) return "text-yellow-500 font-semibold";
  return "text-zinc-700";
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const taskId = parseInt(id, 10);

  // Redirect to 404 if the ID is not a valid number or the task doesn't exist.
  if (isNaN(taskId)) notFound();

  let task;
  try {
    task = await getTask(taskId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus:underline transition-colors duration-150"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </Link>

      {/* Task detail card */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-200">
          <h1
            className="text-xl font-semibold text-zinc-900"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            {task.title}
          </h1>
        </div>

        <dl className="divide-y divide-zinc-100">
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-zinc-500">Status</dt>
            <dd className={`text-sm font-medium ${task.isCompleted ? "text-green-600" : "text-zinc-500"}`}>
              {task.isCompleted ? "Complete" : "Pending"}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-zinc-500">Completed</dt>
            <dd className="text-sm">
              {task.completedAt ? (
                <span className="text-green-600 font-medium">{formatDate(task.completedAt)}</span>
              ) : (
                <span className="text-zinc-300">Not yet</span>
              )}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-zinc-500">Deadline</dt>
            <dd className={`text-sm ${deadlineColorClass(task.deadline)}`}>
              {task.deadline ? formatDate(task.deadline) : (
                <span className="text-zinc-300">Not set</span>
              )}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-zinc-500">Created</dt>
            <dd className="text-sm text-zinc-700">{formatDate(task.createdAt)}</dd>
          </div>
        </dl>

        {/* Complete/incomplete toggle and delete actions. Both are Client Components. */}
        <div className="px-6 py-5 border-t border-zinc-200 flex items-center gap-3">
          <CompleteTaskButton
            taskId={task.id}
            taskTitle={task.title}
            isCompleted={task.isCompleted}
          />
          <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
        </div>
      </div>
    </div>
  );
}
