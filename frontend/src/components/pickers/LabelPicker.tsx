"use client";

/* Label picker (#73): multi-select from existing labels + create-on-Enter. Stays
 * open across toggles (multi-select); the parent closes it via X / outside click.
 * Presentational - the parent (TaskSheet) owns the selected set, the label list,
 * and the create handler (which calls the API and grows the list). */

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import PickerSheet from "@/components/PickerSheet";
import { Label } from "@/lib/api";
import { labelColor } from "@/lib/format";
import { PICKER_ROW_CLASS } from "./_shared";

type Props = {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  allLabels: Label[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  /* Create (or select if it already exists) a label by name. */
  onCreate: (name: string) => void;
  onClose: () => void;
};

export default function LabelPicker({ open, triggerRef, allLabels, selectedIds, onToggle, onCreate, onClose }: Props) {
  const [input, setInput] = useState("");

  const filtered = input.trim()
    ? allLabels.filter((l) => l.name.toLowerCase().includes(input.trim().toLowerCase()))
    : allLabels;
  const exactExists = allLabels.some((l) => l.name.toLowerCase() === input.trim().toLowerCase());

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const name = input.trim();
    if (!name) return;
    onCreate(name); // parent resolves existing or creates new, then selects it
    setInput("");
  }

  return (
    <PickerSheet open={open} triggerRef={triggerRef} title="Labels" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {/* Create / search input */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or create..."
          autoComplete="off"
          className="w-full px-3 py-2 border border-border rounded-md text-text-primary placeholder:text-text-muted bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
        />

        {/* "Create" affordance when the typed name doesn't exist yet */}
        {input.trim() && !exactExists && (
          <button
            type="button"
            onClick={() => {
              onCreate(input.trim());
              setInput("");
            }}
            className={PICKER_ROW_CLASS}
          >
            <Plus size={16} className="text-accent shrink-0" aria-hidden="true" />
            <span className="flex-1 text-sm text-text-primary">
              Create <span className="font-medium">&ldquo;{input.trim()}&rdquo;</span>
            </span>
          </button>
        )}

        {/* Existing labels (multi-select) */}
        <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
          {filtered.map((label) => {
            const selected = selectedIds.includes(label.id);
            return (
              <button
                key={label.id}
                type="button"
                onClick={() => onToggle(label.id)}
                aria-pressed={selected}
                className={PICKER_ROW_CLASS}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: labelColor(label.colorIndex) }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-sm text-text-primary truncate">{label.name}</span>
                {selected && <Check size={16} className="text-accent shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
          {filtered.length === 0 && !input.trim() && (
            <p className="px-3 py-2 text-sm text-text-muted">No labels yet. Type to create one.</p>
          )}
        </div>
      </div>
    </PickerSheet>
  );
}
