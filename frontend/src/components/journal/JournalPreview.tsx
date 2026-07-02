"use client";

// Preview mode (#79): the day's note exactly as it exports. The markdown comes from the
// backend renderer (Services/JournalMarkdown.cs) - one renderer, two consumers - and
// react-markdown only displays it.

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getJournalDayMarkdown } from "@/lib/api";

export default function JournalPreview({ date }: { date: string }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJournalDayMarkdown(date)
      .then((md) => !cancelled && setMarkdown(md))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (error) return <p className="text-danger text-sm py-6">Could not render the preview.</p>;
  if (markdown === null) return <p className="text-sm text-j-muted py-6">Rendering…</p>;

  return (
    <article className="rounded-xl border border-j-line bg-j-card px-6 sm:px-10 py-8 font-journal-serif shadow-[0_1px_2px_rgba(36,38,31,0.05)]">
      <ReactMarkdown
        components={{
          h1: (props) => <h1 className="text-2xl font-bold leading-tight mb-1" {...props} />,
          h2: (props) => (
            <h2 className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-j-muted mt-7 mb-2" {...props} />
          ),
          p: (props) => <p className="my-2 leading-relaxed" {...props} />,
          blockquote: (props) => (
            <blockquote className="my-2 border-l-[2.5px] border-j-accent pl-4 leading-relaxed" {...props} />
          ),
          ul: (props) => <ul className="my-1.5 pl-5 list-disc marker:text-j-muted" {...props} />,
          li: (props) => <li className="my-0.5" {...props} />,
          hr: () => <hr className="border-j-line my-4" />,
          // The frontmatter block arrives as inline text between --- rules; keep code/pre quiet.
          code: (props) => <code className="font-mono text-[0.82rem] text-j-muted" {...props} />,
          a: (props) => <span className="text-j-accent">{props.children}</span>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
