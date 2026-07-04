"use client";

// Shared shell for note sections and rail widgets (#79): the journal card surface with
// the small uppercase mono label. `ghost` renders the collapsed empty state - one quiet
// dashed line, expandable - so empty sections read as calm, never as nagging.

import { ReactNode } from "react";

interface Props {
  title: string;
  children?: ReactNode;
  // Right side of the label row (e.g. the mood widget's "+ Log" action).
  action?: ReactNode;
  // Small non-interactive hint after the title (e.g. "revisit at close").
  hint?: string;
  // Marks the section as load-bearing in the day flow (a small accent dot).
  marked?: boolean;
  ghost?: boolean;
  onExpand?: () => void;
}

export default function SectionCard({ title, children, action, hint, marked, ghost, onExpand }: Props) {
  if (ghost) {
    return (
      <button
        onClick={onExpand}
        className="w-full text-left rounded-xl border border-dashed border-j-line px-5 py-3 text-j-muted hover:border-j-accent hover:text-j-ink transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
      >
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.13em]">{title} · empty - tap to write</span>
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-j-line bg-j-card px-5 py-4 shadow-[0_1px_2px_rgba(36,38,31,0.05)]">
      <div className="flex items-center gap-2 mb-2.5">
        {marked && <span className="w-1.5 h-1.5 rounded-full bg-j-accent" aria-hidden="true" />}
        <h2 className="font-mono text-[0.68rem] uppercase tracking-[0.13em] text-j-muted">
          {title}
          {hint && <span className="normal-case tracking-normal"> · {hint}</span>}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}
