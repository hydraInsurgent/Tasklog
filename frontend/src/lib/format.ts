// Shared date formatting, deadline coloring, and label color utilities.

// 10-color VIBGYOR palette for labels. Index matches Label.colorIndex from the API.
// Used by label chips, the color picker, and the labels dashboard.
export const LABEL_COLORS: string[] = [
  "#EF4444", // 0 - Red
  "#F97316", // 1 - Orange
  "#F59E0B", // 2 - Amber
  "#EAB308", // 3 - Yellow
  "#22C55E", // 4 - Green
  "#14B8A6", // 5 - Teal
  "#3B82F6", // 6 - Blue
  "#6366F1", // 7 - Indigo
  "#8B5CF6", // 8 - Violet
  "#EC4899", // 9 - Pink
];

// Returns the hex color for a label's colorIndex (0-9).
// Falls back to the first color if the index is out of range.
export function labelColor(colorIndex: number): string {
  return LABEL_COLORS[colorIndex] ?? LABEL_COLORS[0];
}

// Shared date formatting and deadline coloring utilities.
// Extracted from TasksClient.tsx so both the desktop table and mobile card
// views share the same logic without duplication.

// Returns a Tailwind class for the deadline based on proximity to today.
// - Past due: red (danger)
// - Within 3 days: yellow (warning)
// - Further out or no deadline: muted zinc
export function deadlineColorClass(deadline: string | null): string {
  if (!deadline) return "text-zinc-400";
  const diff =
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-red-500 font-medium";
  if (diff <= 3) return "text-yellow-500 font-medium";
  return "text-zinc-500";
}

// Resolve a project name from a list by ID. Returns "Inbox" for null (uncategorized tasks).
// Shared between the desktop table and mobile card views.
export function projectName(projectId: number | null, projects: { id: number; name: string }[]): string {
  if (projectId === null) return "Inbox";
  return projects.find((p) => p.id === projectId)?.name ?? "Unknown";
}

// Format an ISO date string to a readable local date (e.g. "12 Mar 2026").
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Priority metadata for the Todoist P1-P4 scale. P1 is the most urgent.
// P4 (none) has no dot so the default view stays uncluttered. Colors follow the
// agreed scheme: P1 red, P2 orange, P3 blue.
export interface PriorityMeta {
  label: string; // short label, e.g. "P1"
  name: string; // human name, e.g. "Urgent"
  dotColor: string | null; // hex for the dot, or null for P4 (no dot)
}

const PRIORITY_META: Record<number, PriorityMeta> = {
  1: { label: "P1", name: "Urgent", dotColor: "#EF4444" }, // red
  2: { label: "P2", name: "High", dotColor: "#F97316" }, // orange
  3: { label: "P3", name: "Medium", dotColor: "#3B82F6" }, // blue
  4: { label: "P4", name: "None", dotColor: null }, // no dot
};

// Display metadata for a priority value (1-4). Falls back to P4 (none) for any
// out-of-range value so the UI never breaks on unexpected data.
export function priorityMeta(priority: number): PriorityMeta {
  return PRIORITY_META[priority] ?? PRIORITY_META[4];
}

// All four priorities in display order (P1 first), for pickers and filters.
export const PRIORITY_OPTIONS: { value: number; meta: PriorityMeta }[] = [
  { value: 1, meta: PRIORITY_META[1] },
  { value: 2, meta: PRIORITY_META[2] },
  { value: 3, meta: PRIORITY_META[3] },
  { value: 4, meta: PRIORITY_META[4] },
];
