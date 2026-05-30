"use client";

/* Project picker (#73): Inbox + every project as picker rows. Single-select -
 * tapping a row commits and closes. null = Inbox (no project). */

import { Check, Inbox, Folder } from "lucide-react";
import PickerSheet from "@/components/PickerSheet";
import { Project } from "@/lib/api";
import { PICKER_ROW_CLASS } from "./_shared";

type Props = {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  value: number | null;
  projects: Project[];
  onChange: (projectId: number | null) => void;
  onClose: () => void;
};

export default function ProjectPicker({ open, triggerRef, value, projects, onChange, onClose }: Props) {
  const rows: { id: number | null; name: string }[] = [
    { id: null, name: "Inbox" },
    ...projects.map((p) => ({ id: p.id, name: p.name })),
  ];

  return (
    <PickerSheet open={open} triggerRef={triggerRef} title="Project" onClose={onClose}>
      <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
        {rows.map((row) => {
          const selected = row.id === value;
          return (
            <button
              key={row.id ?? "inbox"}
              type="button"
              onClick={() => {
                onChange(row.id);
                onClose();
              }}
              aria-pressed={selected}
              className={PICKER_ROW_CLASS}
            >
              {row.id === null ? (
                <Inbox size={16} className="text-text-muted shrink-0" aria-hidden="true" />
              ) : (
                <Folder size={16} className="text-text-muted shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1 text-sm text-text-primary truncate">{row.name}</span>
              {selected && <Check size={16} className="text-accent shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </PickerSheet>
  );
}
