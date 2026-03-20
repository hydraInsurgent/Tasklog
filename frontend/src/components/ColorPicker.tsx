"use client";

import { useEffect, useRef } from "react";
import { LABEL_COLORS } from "@/lib/format";

// Human-readable names for the 10 label colors, used for aria-label accessibility.
const COLOR_NAMES = [
  "Red",
  "Orange",
  "Amber",
  "Yellow",
  "Green",
  "Teal",
  "Blue",
  "Indigo",
  "Violet",
  "Pink",
];

interface Props {
  // The currently selected color index (0-9).
  selectedIndex: number;
  // Called when the user picks a color. Passes the new index.
  onSelect: (index: number) => void;
  // Called when the popover should close (e.g. click outside).
  onClose: () => void;
}

// ColorPicker renders a 5x2 grid of colored circle buttons.
// It is positioned absolutely by the parent (relative container).
// Closes on selection or click-outside.
export default function ColorPicker({ selectedIndex, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close when the user clicks outside the popover.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape key.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Pick a label color"
      className="absolute z-50 top-full mt-1 left-0 bg-white border border-zinc-200 rounded-lg shadow-lg p-3"
    >
      {/* 5x2 grid of color circles - 36px each for comfortable tap targets */}
      <div className="grid grid-cols-5 gap-2">
        {LABEL_COLORS.map((hex, index) => (
          <button
            key={index}
            onClick={() => {
              onSelect(index);
              onClose();
            }}
            aria-label={`Select ${COLOR_NAMES[index]}`}
            aria-pressed={index === selectedIndex}
            className="w-9 h-9 rounded-full cursor-pointer transition-transform duration-100 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600"
            style={{
              backgroundColor: hex,
              // Multi-layer box-shadow creates the selected ring: color border > white gap > color outer ring.
              boxShadow:
                index === selectedIndex
                  ? `0 0 0 2px white, 0 0 0 4px ${hex}`
                  : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
