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
