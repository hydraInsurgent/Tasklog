"use client";

// Front / Back of mind (#79): transient rail lists meant to be CLEARED by end of day.
// Clearing marks the item closed (it stays in the day's record, struck through in the
// export). Yesterday's uncleared items surface as "rolled over - keep?" candidates:
// tapping one consciously adopts it into today; ignoring it costs nothing tomorrow.

import { useState } from "react";
import { X } from "lucide-react";
import { MindItem } from "@/lib/journal";
import SectionCard from "./SectionCard";

interface Props {
  title: string;
  items: MindItem[];
  // Rolled-over candidate texts derived from yesterday (not part of today's content yet).
  rolled: string[];
  onChange: (items: MindItem[]) => void;
}

export default function MindWidget({ title, items, rolled, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const open = items.filter((i) => !i.cleared);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { text, cleared: false }]);
    setDraft("");
  };

  const clear = (text: string) => {
    onChange(items.map((i) => (i.text === text ? { ...i, cleared: true } : i)));
  };

  const adopt = (text: string) => {
    onChange([...items, { text, cleared: false }]);
  };

  return (
    <SectionCard title={title} hint="clear by close">
      {open.length === 0 && rolled.length === 0 && (
        <p className="font-mono text-[0.66rem] text-j-muted py-0.5">clear - nothing on your mind</p>
      )}
      <ul>
        {open.map((item) => (
          <li key={item.text} className="group flex items-baseline gap-2 py-0.5 text-[0.9rem]">
            <span className="w-1 h-1 rounded-full bg-j-muted shrink-0 translate-y-[-3px]" aria-hidden="true" />
            <span className="flex-1">{item.text}</span>
            <button
              onClick={() => clear(item.text)}
              aria-label={`Clear "${item.text}" (done with this)`}
              title="Clear - done with this"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-j-muted hover:text-j-ink px-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
        {rolled.map((text) => (
          <li key={`rolled-${text}`} className="flex items-baseline gap-2 py-0.5 text-[0.9rem] text-j-muted">
            <span className="w-1 h-1 rounded-full bg-j-muted/60 shrink-0 translate-y-[-3px]" aria-hidden="true" />
            <span className="flex-1">{text}</span>
            <button
              onClick={() => adopt(text)}
              aria-label={`Keep "${text}" for today`}
              className="rounded-full border border-dashed border-j-muted px-2 py-px font-mono text-[0.58rem] uppercase tracking-wide hover:border-j-accent hover:text-j-accent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
            >
              rolled · keep?
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
        className="w-full bg-transparent text-[0.82rem] text-j-ink placeholder:text-j-muted/70 py-1 focus:outline-none"
      />
    </SectionCard>
  );
}
