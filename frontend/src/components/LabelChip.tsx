"use client";

import { X } from "lucide-react";
import { Label } from "@/lib/api";
import { labelColor } from "@/lib/format";

interface Props {
  label: Label;
  // When provided, renders a remove button inside the chip.
  onRemove?: () => void;
}

// Shared colored chip used wherever labels appear (task detail, add form, mobile cards).
// Background color is applied inline because it comes from a dynamic value (colorIndex),
// not a Tailwind class - Tailwind can't purge dynamic color strings at build time.
export default function LabelChip({ label, onRemove }: Props) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: labelColor(label.colorIndex) }}
    >
      {label.name}

      {/* Remove button - only rendered when onRemove is provided (e.g. on task detail) */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label.name}`}
          // Negative margin and padding extend the tap area to 44px without
          // making the chip visually larger (touch-target rule).
          className="-mr-1 ml-0.5 -my-3 px-1 py-3 flex items-center text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 rounded-full cursor-pointer transition-colors duration-150"
        >
          <X size={10} aria-hidden="true" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
