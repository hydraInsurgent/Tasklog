"use client";

import { useRef, useState, useLayoutEffect } from "react";
import { X } from "lucide-react";
import { parseQuickAdd, tokenKey, QuickAddProject, QuickAddToken, QuickAddTokenType } from "@/lib/quickAdd";

interface Props {
  value: string;
  onChange: (value: string) => void;
  // For recognizing #project (known only) and autosuggesting #/@.
  projects: QuickAddProject[];
  labels: { id: number; name: string }[];
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  // Whether to render the "captured" chips row below the input. Off inside the
  // TaskSheet, where the sheet's own chips (Due/Priority/Project/Label/Repeat)
  // already reflect the parsed tokens, so the row would be redundant (#73).
  showCapturedChips?: boolean;
  // Whether to recognize + highlight quick-add tokens and offer #/@ autosuggest.
  // Off in edit mode, where the title is a literal value (no parsing) (#73).
  highlight?: boolean;
  // Token keys (see tokenKey) the user has dismissed with Escape: rendered as plain
  // text, not highlighted/parsed. The parent owns the set so its chips/save agree.
  ignoredKeys?: Set<string>;
  // Called with a token's key when the user presses Escape on it (un-recognize it).
  onIgnoreToken?: (key: string) => void;
}

// Subtle highlighter tints behind recognized tokens, by type (zinc-palette friendly).
const TINT: Record<QuickAddTokenType, string> = {
  date: "bg-blue-100",
  recurrence: "bg-violet-100",
  project: "bg-indigo-100",
  label: "bg-emerald-100",
  priority: "bg-rose-100",
};

// Box + text metrics shared EXACTLY by the input and the backdrop so the tint
// rectangles line up under the right characters. 16px/24px per the UI spec.
const METRICS = "px-3 py-2 text-base leading-6 border rounded-md";

// Human label per token type, for the "captured" chips row.
const TYPE_LABEL: Record<QuickAddTokenType, string> = {
  date: "Due",
  recurrence: "Repeat",
  project: "Project",
  label: "Label",
  priority: "Priority",
};

interface Suggest {
  symbol: "#" | "@";
  start: number; // index of the symbol in `value`
  items: string[];
}

export default function QuickAddInput({ value, onChange, projects, labels, disabled, id, placeholder, showCapturedChips = true, highlight = true, ignoredKeys, onIgnoreToken }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  // Highlighted suggestion for keyboard navigation. Reset to 0 whenever the list changes.
  const [active, setActive] = useState(0);

  // Recognized token spans drive the highlight; recompute on each render (cheap).
  // Disabled (no tint, no autosuggest) when highlight=false, e.g. the edit title field.
  // Tokens the user dismissed (ignoredKeys) are excluded, so they render as plain text.
  const tokens = highlight
    ? parseQuickAdd(value, projects).tokens.filter((t) => !ignoredKeys?.has(tokenKey(t)))
    : [];

  // Keep the backdrop scrolled in lockstep with the input (single-line h-scroll).
  useLayoutEffect(() => {
    if (inputRef.current && backdropRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  });

  // Build the backdrop content: transparent text (the visible text is the input's,
  // sitting on top), with token runs given a tinted background.
  const segments: { text: string; type?: QuickAddTokenType }[] = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.start > cursor) segments.push({ text: value.slice(cursor, t.start) });
    segments.push({ text: value.slice(t.start, t.end), type: t.type });
    cursor = t.end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor) });

  // Autosuggest: if the caret sits inside a #word / @word, offer matching names.
  function refreshSuggest(el: HTMLInputElement) {
    if (!highlight) return; // edit mode: literal title, no token autosuggest
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(/([#@])([\w-]*)$/);
    if (!m) {
      setSuggest(null);
      return;
    }
    const symbol = m[1] as "#" | "@";
    const query = m[2].toLowerCase();
    const pool = symbol === "#" ? projects.map((p) => p.name) : labels.map((l) => l.name);
    const items = pool.filter((n) => n.toLowerCase().includes(query)).slice(0, 6);
    setSuggest(items.length > 0 ? { symbol, start: caret - m[0].length, items } : null);
    setActive(0);
  }

  // Keyboard navigation while the suggestion dropdown is open. Returns true if the key
  // was handled (so the caller can stop - e.g. Enter must not also submit the form).
  function handleNavKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggest) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggest.items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + suggest.items.length) % suggest.items.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // select the suggestion instead of submitting the form
      applySuggestion(suggest.items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSuggest(null);
    }
  }

  // Escape on a recognized token un-recognizes it (keeps the text, stops parsing it)
  // rather than closing the sheet. Targets the token under the caret, else the last
  // active token (so repeated Escape peels recognitions off). Returns true if it
  // handled the key, so the caller can stop it bubbling to the sheet's close handler.
  function handleEscapeIgnore(e: React.KeyboardEvent<HTMLInputElement>): boolean {
    if (!highlight || !onIgnoreToken || tokens.length === 0) return false;
    const caret = inputRef.current?.selectionStart ?? value.length;
    const under = tokens.find((t) => caret >= t.start && caret <= t.end);
    const target = under ?? [...tokens].reverse().find((t) => t.end <= caret) ?? tokens[tokens.length - 1];
    if (!target) return false;
    e.preventDefault();
    e.stopPropagation(); // don't let the sheet's Escape-to-close fire
    onIgnoreToken(tokenKey(target));
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggest) {
      handleNavKey(e);
      return;
    }
    if (e.key === "Escape") handleEscapeIgnore(e);
  }

  // "Unlink" a recognized token: remove its text from the title so it is no longer
  // parsed (the field/highlight updates on the next render). Simpler + safer than an
  // in-place contenteditable click-to-unlink.
  function removeToken(tok: QuickAddToken) {
    const next = (value.slice(0, tok.start) + value.slice(tok.end)).replace(/\s+/g, " ").trim();
    onChange(next);
    inputRef.current?.focus();
  }

  function applySuggestion(name: string) {
    if (!suggest) return;
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next = value.slice(0, suggest.start) + suggest.symbol + name + " " + value.slice(caret);
    onChange(next);
    setSuggest(null);
    // Restore focus + put the caret after the inserted token.
    requestAnimationFrame(() => {
      if (el) {
        const pos = suggest.start + 1 + name.length + 1;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  }

  return (
    <div>
      <div className="relative">
      {/* Backdrop: invisible text + tint rectangles behind recognized tokens. */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 w-full overflow-hidden whitespace-pre border-transparent text-transparent ${METRICS}`}
      >
        {segments.map((s, i) =>
          s.type ? (
            <span key={i} className={`rounded-[3px] ${TINT[s.type]}`}>{s.text}</span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>

      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refreshSuggest(e.target);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          // Don't let nav keys re-run refreshSuggest (it would reset the highlight).
          if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) refreshSuggest(e.currentTarget);
        }}
        onClick={(e) => refreshSuggest(e.currentTarget)}
        onScroll={(e) => {
          if (backdropRef.current) backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onBlur={() => setSuggest(null)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={`relative w-full whitespace-pre border-border bg-transparent text-text-primary caret-zinc-900 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 ${METRICS}`}
      />

      {/* #/@ autosuggest dropdown. */}
      {suggest && (
        <ul
          role="listbox"
          aria-label={suggest.symbol === "#" ? "Project suggestions" : "Label suggestions"}
          className="absolute z-20 top-full mt-1 w-56 bg-surface border border-border rounded-md shadow-md max-h-44 overflow-y-auto"
        >
          {suggest.items.map((name, i) => (
            <li key={name} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Beat the input's blur so the click registers.
                  e.preventDefault();
                  applySuggestion(name);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-text-primary focus:outline-none cursor-pointer transition-colors duration-150 ${
                  i === active ? "bg-surface-raised" : "hover:bg-surface-raised"
                }`}
              >
                <span className="text-text-muted">{suggest.symbol}</span>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>

      {/* "Captured" chips: what the title parsed into, each removable (unlink). Doubles
          as a confirmation that e.g. a repeat was recognized, not just a due date.
          Suppressed inside the TaskSheet (showCapturedChips=false) where the sheet's
          own field chips already show the captured values. */}
      {showCapturedChips && tokens.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Recognized from the title">
          {tokens.map((tok, i) => (
            <li key={`${tok.start}-${i}`}>
              <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-surface-raised text-xs text-text-primary">
                <span className="text-text-muted">{TYPE_LABEL[tok.type]}</span>
                <span className="font-medium">{tok.text}</span>
                <button
                  type="button"
                  onClick={() => removeToken(tok)}
                  aria-label={`Remove ${TYPE_LABEL[tok.type]} ${tok.text}`}
                  className="flex items-center justify-center w-4 h-4 rounded-full text-text-muted hover:text-text-primary hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
