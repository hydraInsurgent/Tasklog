"use client";

// A simple list section (Gratitude items, Affirmations). Enter adds; hover reveals remove.

import { useState } from "react";
import { X } from "lucide-react";
import SectionCard from "./SectionCard";

interface Props {
  title: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export default function ListSection({ title, hint, value, onChange }: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...value, text]);
    setDraft("");
  };

  return (
    <SectionCard title={title} hint={hint}>
      <ul>
        {value.map((item, i) => (
          <li key={`${i}-${item}`} className="group flex items-baseline gap-2.5 py-1 font-journal-serif text-[0.98rem]">
            <span className="w-1.5 h-1.5 rounded-full bg-j-muted shrink-0 translate-y-[-3px]" aria-hidden="true" />
            <span className="flex-1">{item}</span>
            <button
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`Remove "${item}"`}
              className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 text-j-muted hover:text-danger p-2 -my-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        onBlur={add}
        placeholder="+ add"
        aria-label={`Add to ${title}`}
        className="w-full bg-transparent text-sm text-j-ink placeholder:text-j-muted/70 py-1.5 focus:outline-none"
      />
    </SectionCard>
  );
}
