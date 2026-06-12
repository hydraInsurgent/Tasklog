"use client";

/* A compact swatch button that opens a floating ProjectColorPicker popover on click.
 * Use wherever a full inline palette would be too large (sidebar rows, modal fields). */

import { useEffect, useRef, useState } from "react";
import ProjectColorPicker from "./ProjectColorPicker";

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  size?: "sm" | "md"; // sm = w-5 h-5, md = w-6 h-6 (default)
}

export default function ColorPickerButton({ value, onChange, size = "md" }: Props) {
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

  const dim = size === "sm" ? "w-5 h-5" : "w-6 h-6";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={value ? `Color: ${value}` : "Pick a color"}
        title={value ? value : "No color set"}
        className={`${dim} rounded-full border-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 transition-shadow duration-75 ${
          value ? "border-transparent" : "border-text-muted"
        }`}
        style={value ? { backgroundColor: value } : {}}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Pick a project color"
          className="absolute z-50 top-8 left-0 bg-surface border border-border rounded-lg shadow-xl p-3 w-max"
          onClick={(e) => e.stopPropagation()}
        >
          <ProjectColorPicker
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
