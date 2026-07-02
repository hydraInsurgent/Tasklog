"use client";

// A free-writing section (What's going on, Mind dump, Daily review, Journal). Serif
// voice, auto-growing textarea. Optional sections start as a collapsed ghost when empty -
// the "earned depth only" rule made visible.

import { useEffect, useRef, useState } from "react";
import SectionCard from "./SectionCard";

interface Props {
  title: string;
  value: string;
  optional?: boolean;
  onChange: (value: string) => void;
}

export default function ProseSection({ title, value, optional, onChange }: Props) {
  const [expanded, setExpanded] = useState(!optional || value.trim().length > 0);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Collapse state follows the data when the date changes underneath us.
  useEffect(() => {
    setExpanded(!optional || value.trim().length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, optional]);

  // Auto-grow: height tracks content so the note reads as one document.
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value, expanded]);

  if (!expanded) {
    return <SectionCard title={title} ghost onExpand={() => { setExpanded(true); setTimeout(() => ref.current?.focus(), 0); }} />;
  }

  return (
    <SectionCard title={title}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="…"
        aria-label={title}
        className="w-full resize-none bg-transparent font-journal-serif text-[1.02rem] leading-relaxed text-j-ink placeholder:text-j-muted/70 focus:outline-none"
      />
    </SectionCard>
  );
}
