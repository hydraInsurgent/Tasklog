import { Repeat } from "lucide-react";
import { describeRecurrence } from "@/lib/format";

// A small "repeats" indicator for recurring tasks. Icon-only by default (list
// rows / cards) with the human description as a tooltip + aria-label; pass
// showLabel to render the description inline (task detail page).
export default function RecurringBadge({
  recurrence,
  showLabel = false,
}: {
  recurrence: string | null;
  showLabel?: boolean;
}) {
  if (!recurrence) return null;
  const label = describeRecurrence(recurrence);
  return (
    <span
      className="inline-flex items-center gap-1 text-text-muted"
      title={label}
      aria-label={`Repeats: ${label}`}
    >
      <Repeat size={14} aria-hidden="true" />
      {showLabel && <span className="text-xs font-medium">{label}</span>}
    </span>
  );
}
