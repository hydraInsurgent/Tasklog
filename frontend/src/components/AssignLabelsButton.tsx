"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Label, setTaskLabels } from "@/lib/api";
import LabelChip from "./LabelChip";

interface Props {
  taskId: number;
  currentLabels: Label[];
  allLabels: Label[];
}

// Client Component used on the task detail page to view and edit the labels
// assigned to a task. Shows chips for current labels (with remove buttons)
// and a dropdown to add labels that aren't yet assigned.
export default function AssignLabelsButton({ taskId, currentLabels, allLabels }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The IDs of labels currently on this task, kept in local state so the UI
  // updates immediately while router.refresh() revalidates the server data.
  const [assignedIds, setAssignedIds] = useState<number[]>(currentLabels.map((l) => l.id));

  // Resolve full Label objects from assignedIds so we can render chips.
  const labelMap = new Map(allLabels.map((l) => [l.id, l]));
  const assignedLabels = assignedIds.map((id) => labelMap.get(id)).filter(Boolean) as Label[];

  // Labels available to add (not yet assigned to this task).
  const availableLabels = allLabels.filter((l) => !assignedIds.includes(l.id));

  // Call the API with the new set of label IDs, then revalidate page data.
  async function saveLabels(newIds: number[]) {
    setSaving(true);
    setError("");
    try {
      await setTaskLabels(taskId, newIds);
      setAssignedIds(newIds);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update labels.");
    } finally {
      setSaving(false);
    }
  }

  function handleRemove(labelId: number) {
    saveLabels(assignedIds.filter((id) => id !== labelId));
  }

  function handleAdd(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = parseInt(e.target.value, 10);
    if (isNaN(selected)) return;
    saveLabels([...assignedIds, selected]);
    // Reset the select back to the placeholder.
    e.target.value = "";
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Spinner shown while a request is in flight */}
      {saving && (
        <Loader2 size={14} className="animate-spin text-zinc-400" aria-hidden="true" />
      )}

      {/* Chips for currently assigned labels */}
      {assignedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-end">
          {assignedLabels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              onRemove={saving ? undefined : () => handleRemove(label.id)}
            />
          ))}
        </div>
      )}

      {/* Dropdown to add a label not yet assigned */}
      {availableLabels.length > 0 && (
        <select
          onChange={handleAdd}
          disabled={saving}
          defaultValue=""
          aria-label="Add label"
          className="text-sm px-2 py-1 border border-zinc-200 rounded-md text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white transition-shadow duration-150"
        >
          <option value="" disabled>
            Add label...
          </option>
          {availableLabels.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {/* No labels exist at all - guide the user */}
      {allLabels.length === 0 && (
        <span className="text-sm text-zinc-400">No labels yet</span>
      )}

      {/* Inline error */}
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
