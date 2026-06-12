"use client";

/* Label color swatch button that opens a 5x2 popover grid of the 10 label colors.
 * Same pattern as ColorPickerButton but typed for colorIndex (0-9) not hex. */

import { useEffect, useRef, useState } from "react";
import { LABEL_COLORS } from "@/lib/format";

const COLOR_NAMES = ["Red", "Orange", "Amber", "Yellow", "Green", "Teal", "Blue", "Indigo", "Violet", "Pink"];

interface Props {
  colorIndex: number;
  onChange: (index: number) => void;
  disabled?: boolean;
}

export default function LabelColorButton({ colorIndex, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`Label color: ${COLOR_NAMES[colorIndex] ?? "Unknown"}`}
        title={COLOR_NAMES[colorIndex]}
        className="w-5 h-5 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 transition-transform duration-100 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: LABEL_COLORS[colorIndex] }}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Pick a label color"
          className="absolute z-50 top-7 left-0 bg-surface border border-border rounded-lg shadow-xl p-3 w-max"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-5 gap-2">
            {LABEL_COLORS.map((hex, index) => (
              <button
                key={index}
                type="button"
                onClick={() => { onChange(index); setOpen(false); }}
                aria-label={`Select ${COLOR_NAMES[index]}`}
                aria-pressed={index === colorIndex}
                className="w-9 h-9 rounded-full cursor-pointer transition-transform duration-100 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
                style={{
                  backgroundColor: hex,
                  boxShadow: index === colorIndex ? `0 0 0 2px white, 0 0 0 4px ${hex}` : undefined,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
