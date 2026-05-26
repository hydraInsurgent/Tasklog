import { priorityMeta } from "@/lib/format";

// A small colored dot indicating a task's priority (P1 red, P2 orange, P3 blue).
// P4 (none) renders nothing so the default view stays uncluttered. The dot
// carries an accessible label/title so the priority isn't conveyed by color alone.
export default function PriorityDot({ priority }: { priority: number }) {
  const meta = priorityMeta(priority);
  if (!meta.dotColor) return null;
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: meta.dotColor }}
      role="img"
      aria-label={`Priority ${meta.label} (${meta.name})`}
      title={`${meta.label} - ${meta.name}`}
    />
  );
}
