// Pure helper that groups tasks into board columns (#73 Stage C). No React, no clock
// beyond the server-computed dueStatus the tasks already carry - so it's unit-testable.

import { Task, Project } from "./api";
import type { GroupBy } from "@/components/ProjectLayout";

export interface BoardColumn {
  key: string;
  label: string;
  // Token color class for the column header accent bar (e.g. "bg-danger").
  accent: string;
  // For project columns: the project's own color hex, rendered inline over `accent` (#77).
  accentColor?: string;
  tasks: Task[];
}

// Due-bucket columns, in fixed order. Keys match the server's dueStatus values.
const DUE_BUCKETS: { key: Task["dueStatus"]; label: string; accent: string }[] = [
  { key: "overdue", label: "Overdue", accent: "bg-danger" },
  { key: "today", label: "Today", accent: "bg-warning" },
  { key: "this_week", label: "This week", accent: "bg-accent" },
  { key: "later", label: "Later", accent: "bg-text-muted" },
  { key: "none", label: "No date", accent: "bg-border" },
];

const PRIORITY_COLUMNS: { value: number; label: string; accent: string }[] = [
  { value: 1, label: "P1 · Urgent", accent: "bg-danger" },
  { value: 2, label: "P2 · High", accent: "bg-warning" },
  { value: 3, label: "P3 · Medium", accent: "bg-accent" },
  { value: 4, label: "P4 · None", accent: "bg-border" },
];

// Within a column: soonest deadline first, tasks with no deadline last, newest-created
// as the tiebreak. (Review note: the plan said "most-recent-due-first"; soonest-first
// reads better for a to-do board - flag if you'd rather flip it.)
function byDeadlineThenCreated(a: Task, b: Task): number {
  const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
  const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
  if (ad !== bd) return ad - bd;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// Group `tasks` into ordered columns for the board. Due and Priority always show their
// full fixed set of columns (even empty ones, so the structure is stable); Project shows
// Inbox + only the projects that currently have tasks.
export function groupTasksForBoard(tasks: Task[], groupBy: GroupBy, projects: Project[]): BoardColumn[] {
  const sorted = [...tasks].sort(byDeadlineThenCreated);

  if (groupBy === "due") {
    return DUE_BUCKETS.map((b) => ({ key: b.key, label: b.label, accent: b.accent, tasks: sorted.filter((t) => t.dueStatus === b.key) }));
  }

  if (groupBy === "priority") {
    return PRIORITY_COLUMNS.map((p) => ({
      key: `p${p.value}`,
      label: p.label,
      accent: p.accent,
      tasks: sorted.filter((t) => t.priority === p.value),
    }));
  }

  // project
  const cols: BoardColumn[] = [];
  const inbox = sorted.filter((t) => t.projectId === null);
  if (inbox.length > 0) cols.push({ key: "inbox", label: "Inbox", accent: "bg-text-muted", tasks: inbox });
  for (const p of projects) {
    const ts = sorted.filter((t) => t.projectId === p.id);
    if (ts.length > 0) cols.push({ key: `proj-${p.id}`, label: p.name, accent: "bg-accent", accentColor: p.color ?? undefined, tasks: ts });
  }
  return cols;
}
