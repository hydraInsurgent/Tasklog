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

// Format an ISO date string to a readable local date (e.g. "12 Mar 2026").
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
