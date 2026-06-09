"use client";

/* Project color picker (#77). A curated palette of muted swatches (a nicer set than the
 * 10-color label VIBGYOR) plus a "Custom" button that reveals a react-colorful hex picker for
 * any color, and a "None" option. Used on project create + the Edit Project modal. */

import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Check, Pipette, Ban } from "lucide-react";

// 16 curated hues - tasteful, spaced around the wheel, readable as block fills.
export const PROJECT_PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#14B8A6",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#EC4899", "#F43F5E", "#71717A",
];

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
}

export default function ProjectColorPicker({ value, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {/* None */}
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setCustomOpen(false);
          }}
          aria-label="No color"
          aria-pressed={value === null}
          className={`flex items-center justify-center w-7 h-7 rounded-full border border-border text-text-muted hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer ${
            value === null ? "ring-2 ring-accent" : ""
          }`}
        >
          <Ban size={14} aria-hidden="true" />
        </button>

        {PROJECT_PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => {
              onChange(hex);
              setCustomOpen(false);
            }}
            aria-label={`Color ${hex}`}
            aria-pressed={value?.toLowerCase() === hex.toLowerCase()}
            style={{ backgroundColor: hex }}
            className={`flex items-center justify-center w-7 h-7 rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer ${
              value?.toLowerCase() === hex.toLowerCase() ? "ring-2 ring-offset-1 ring-accent" : ""
            }`}
          >
            {value?.toLowerCase() === hex.toLowerCase() && <Check size={14} className="text-white" aria-hidden="true" />}
          </button>
        ))}

        {/* Custom hex */}
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          aria-label="Custom color"
          aria-pressed={customOpen}
          className={`flex items-center justify-center w-7 h-7 rounded-full border border-border text-text-muted hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer ${
            customOpen ? "ring-2 ring-accent" : ""
          }`}
        >
          <Pipette size={14} aria-hidden="true" />
        </button>
      </div>

      {customOpen && (
        <div className="mt-2">
          <HexColorPicker color={value ?? "#3B82F6"} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
