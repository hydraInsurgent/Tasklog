"use client";

// Projects today: which projects are active and what the focus is (not a task list).
// A combobox picks from the user's real Tasklog projects; the focus is typed inline
// next to the name. Removing a row only removes it from the day's note.

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Project } from "@/lib/api";
import { ProjectFocus } from "@/lib/journal";
import SectionCard from "./SectionCard";

interface Props {
  title: string;
  value: ProjectFocus[];
  projects: Project[];
  onChange: (value: ProjectFocus[]) => void;
}

export default function ProjectsSection({ title, value, projects, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const used = new Set(value.map((p) => p.name));
  const hits = projects.filter(
    (p) => !used.has(p.name) && p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const pick = (name: string) => {
    onChange([...value, { name, focus: "" }]);
    setQuery("");
    setOpen(false);
    // Focus the new row's focus field so "pick, then say why" is one motion.
    setTimeout(() => {
      const inputs = listRef.current?.querySelectorAll<HTMLInputElement>("input[data-focus-field]");
      inputs?.[inputs.length - 1]?.focus();
    }, 0);
  };

  return (
    <SectionCard title={title}>
      <div ref={listRef}>
        {value.map((p, i) => (
          <div key={p.name} className="group flex items-baseline gap-2 py-1">
            <b className="font-journal-serif whitespace-nowrap">{p.name}</b>
            <span className="text-j-muted">-</span>
            <input
              data-focus-field
              value={p.focus}
              placeholder="what's the focus today?"
              aria-label={`Focus for ${p.name}`}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, focus: e.target.value } : x)))}
              className="flex-1 min-w-0 bg-transparent font-journal-serif text-[0.96rem] text-j-ink placeholder:text-j-muted/70 border-b border-dashed border-transparent focus:border-j-accent focus:outline-none"
            />
            <button
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`Remove ${p.name} from today`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-j-muted hover:text-danger p-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="relative mt-2">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="+ add a project for today…"
          aria-label="Add a project for today"
          className="w-full rounded-lg border border-dashed border-j-line bg-j-paper px-3.5 py-2 text-sm text-j-ink placeholder:text-j-muted/70 focus:border-j-accent focus:border-solid focus:outline-none"
        />
        {open && hits.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-j-line bg-j-card shadow-lg overflow-hidden">
            {hits.map((p) => (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); pick(p.name); }}
                className="block w-full text-left px-3.5 py-2 text-sm hover:bg-j-accent-soft cursor-pointer focus:outline-none focus-visible:bg-j-accent-soft"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
