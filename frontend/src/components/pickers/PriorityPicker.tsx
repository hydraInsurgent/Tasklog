"use client";

/* Priority picker (#73): the four P1-P4 options as picker rows. Single-select -
 * tapping a row commits and closes. Reuses PRIORITY_OPTIONS so the labels/dots
 * match the rest of the app. */

import { Check } from "lucide-react";
import PickerSheet from "@/components/PickerSheet";
import { PRIORITY_OPTIONS } from "@/lib/format";
import { PICKER_ROW_CLASS } from "./_shared";

type Props = {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  value: number;
  onChange: (priority: number) => void;
  onClose: () => void;
};

export default function PriorityPicker({ open, triggerRef, value, onChange, onClose }: Props) {
  return (
    <PickerSheet open={open} triggerRef={triggerRef} title="Priority" onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        {PRIORITY_OPTIONS.map(({ value: v, meta }) => {
          const selected = v === value;
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                onClose();
              }}
              aria-pressed={selected}
              className={PICKER_ROW_CLASS}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: meta.dotColor ?? "transparent", border: meta.dotColor ? undefined : "1.5px solid var(--color-border)" }}
                aria-hidden="true"
              />
              <span className="flex-1 text-sm text-text-primary">
                {meta.label} <span className="text-text-muted">{meta.name}</span>
              </span>
              {selected && <Check size={16} className="text-accent shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </PickerSheet>
  );
}
