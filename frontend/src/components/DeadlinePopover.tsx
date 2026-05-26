"use client";

import { useEffect, useRef } from "react";
import { DEADLINE_PRESETS, resolvePreset, type DeadlinePreset } from "@/lib/deadlinePresets";

interface Props {
  // Called with the resolved deadline ("YYYY-MM-DD") or null (for "No deadline").
  onPick: (deadline: string | null) => void;
  onClose: () => void;
}

// A small popover of quick-deadline presets, opened from a task's deadline pill.
// Positioned by the caller's relative wrapper (same pattern as FilterPanel).
export default function DeadlinePopover({ onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape and on outside click/touch (matches FilterPanel/TaskCard menu).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Set deadline"
      className="absolute left-0 top-full mt-1 w-40 bg-white border border-zinc-200 rounded-md shadow-lg z-30 overflow-hidden"
    >
      {DEADLINE_PRESETS.map((preset) => (
        <button
          key={preset.value}
          role="menuitem"
          onClick={() => {
            onPick(resolvePreset(preset.value as DeadlinePreset));
            onClose();
          }}
          className="block w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 cursor-pointer transition-colors duration-150"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
