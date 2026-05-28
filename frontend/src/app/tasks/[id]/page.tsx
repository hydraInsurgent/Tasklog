// Task detail page. Fetches a single task server-side (Server Component).
// The [id] segment is provided by Next.js App Router dynamic routing.
// DeleteTaskButton and CompleteTaskButton are Client Components for interactive actions.

import Link from "next/link";
import { getTask, getProjects, getLabels, type Project, type Label } from "@/lib/api";
import { formatDeadline } from "@/lib/format";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DeleteTaskButton from "@/components/DeleteTaskButton";
import CompleteTaskButton from "@/components/CompleteTaskButton";
import AssignProjectButton from "@/components/AssignProjectButton";
import AssignLabelsButton from "@/components/AssignLabelsButton";
import TaskComments from "@/components/TaskComments";
import RecurringBadge from "@/components/RecurringBadge";

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
  if (!deadline) return "text-text-muted";
  const diff =
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-danger font-semibold";
  if (diff <= 3) return "text-yellow-500 font-semibold";
  return "text-text-primary";
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

  // Fetch projects for the assignment dropdown. If this fails, fall back to an
  // empty list so the task detail page still loads (assignment will be hidden).
  let projects: Project[] = [];
  try {
    projects = await getProjects();
  } catch {
    projects = [];
  }

  // Fetch all labels for the label assignment UI. Fall back to empty array on
  // error so the rest of the page still renders.
  let labels: Label[] = [];
  try {
    labels = await getLabels();
  } catch {
    labels = [];
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline transition-colors duration-150"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </Link>

      {/* Task detail card */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <h1
            className="text-xl font-semibold text-text-primary"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            {task.title}
          </h1>
          {/* Description: plain multiline text, preserved line breaks. Shown only when present. */}
          {task.description && (
            <p className="mt-2 text-sm text-zinc-600 whitespace-pre-wrap break-words">
              {task.description}
            </p>
          )}
        </div>

        <dl className="divide-y divide-border-muted">
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-text-muted">Status</dt>
            <dd className={`text-sm font-medium ${task.isCompleted ? "text-green-600" : "text-text-muted"}`}>
              {task.isCompleted ? "Complete" : "Pending"}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-text-muted">Completed</dt>
            <dd className="text-sm">
              {task.completedAt ? (
                <span className="text-green-600 font-medium">{formatDate(task.completedAt)}</span>
              ) : (
                <span className="text-zinc-300">Not yet</span>
              )}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-text-muted">Deadline</dt>
            <dd className={`text-sm ${deadlineColorClass(task.deadline)}`}>
              {task.deadline ? formatDeadline(task.deadline) : (
                <span className="text-zinc-300">Not set</span>
              )}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-text-muted">Repeats</dt>
            <dd className="text-sm">
              {task.recurrence ? (
                <RecurringBadge recurrence={task.recurrence} showLabel />
              ) : (
                <span className="text-zinc-300">Does not repeat</span>
              )}
            </dd>
          </div>
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-text-muted">Created</dt>
            <dd className="text-sm text-text-primary">{formatDate(task.createdAt)}</dd>
          </div>
          {/* Project assignment - editable via dropdown */}
          <div className="px-6 py-4 flex justify-between items-center">
            <dt className="text-sm font-medium text-text-muted">Project</dt>
            <dd>
              <AssignProjectButton
                taskId={task.id}
                currentProjectId={task.projectId}
                projects={projects ?? []}
              />
            </dd>
          </div>
          {/* Label assignment - editable via chip + dropdown UI */}
          <div className="px-6 py-4 flex justify-between items-start gap-4">
            <dt className="text-sm font-medium text-text-muted pt-1">Labels</dt>
            <dd>
              <AssignLabelsButton
                taskId={task.id}
                currentLabels={task.labels}
                allLabels={labels}
              />
            </dd>
          </div>
        </dl>

        {/* Complete/incomplete toggle and delete actions. Both are Client Components. */}
        <div className="px-6 py-5 border-t border-border flex items-center gap-3">
          <CompleteTaskButton
            taskId={task.id}
            taskTitle={task.title}
            isCompleted={task.isCompleted}
          />
          <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
        </div>

        {/* Comments - interactive add/delete (Client Component). */}
        <TaskComments taskId={task.id} initialComments={task.comments ?? []} />
      </div>
    </div>
  );
}
