"use client";

// Always-in-reach card triage (#87) for the desktop rail / mobile drawer.
// Extracted from CompanionClient (review R16). Same captures state as the
// inline cards - two views, one truth.

import { useState } from "react";
import { Check, X } from "lucide-react";
import { type CaptureDto, type Project } from "@/lib/api";

export default function CardsPanel({
  captures,
  projects,
  actingId,
  onKeep,
  onToss,
  onRestore,
}: {
  captures: CaptureDto[];
  projects: Project[];
  // Shared in-flight lock with the inline cards (review R5).
  actingId: number | null;
  onKeep: (id: number) => Promise<void>;
  onToss: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  // Panel actions surface their own failures (review R25): the inline card's
  // error state is component-local and cannot speak for a tap made here.
  const [panelError, setPanelError] = useState<string | null>(null);
  const pending = captures.filter((c) => c.status === "proposed");
  const tossed = captures.filter((c) => c.status === "dismissed");
  const keptCount = captures.filter((c) => c.status === "confirmed").length;

  const act = async (id: number, fn: () => Promise<void>) => {
    setBusyId(id);
    setPanelError(null);
    try {
      await fn();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Something went wrong - retry.");
    } finally {
      setBusyId(null);
    }
  };

  const projectLine = (c: CaptureDto) =>
    c.payload.newProjectName
      ? `${c.payload.newProjectName} · new`
      : projects.find((p) => p.id === c.payload.projectId)?.name ?? "Inbox";

  return (
    <div className="rounded-2xl border border-c-line bg-c-card p-3">
      <p className="text-sm font-medium text-c-ink mb-2">
        Cards
        <span className="text-c-muted font-normal">
          {" "}· {pending.length} pending
          {keptCount > 0 ? ` · ${keptCount} kept` : ""}
        </span>
      </p>

      {pending.length === 0 && tossed.length === 0 && (
        <p className="text-xs text-c-muted">Nothing suggested yet.</p>
      )}

      <ul className="space-y-2">
        {pending.map((c) => (
          <li key={c.id} className="rounded-xl border border-c-accent/40 bg-c-bg px-3 py-2">
            <p className="text-sm text-c-ink leading-snug">{c.payload.title}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-c-muted truncate">{projectLine(c)}</span>
              <span className="flex gap-1 shrink-0">
                <button
                  type="button"
                  disabled={busyId !== null || actingId !== null}
                  onClick={() => act(c.id, () => onKeep(c.id))}
                  aria-label={`Keep "${c.payload.title}"`}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-c-accent text-white disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                >
                  <Check size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busyId !== null || actingId !== null}
                  onClick={() => act(c.id, () => onToss(c.id))}
                  aria-label={`Toss "${c.payload.title}"`}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-c-line text-c-muted hover:bg-c-accent-soft disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </span>
            </div>
          </li>
        ))}

        {tossed.map((c) => (
          <li key={c.id} className="rounded-xl border border-c-line bg-c-bg px-3 py-2 opacity-70">
            <p className="text-sm text-c-ink leading-snug line-through decoration-c-muted/60">
              {c.payload.title}
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-c-muted">tossed</span>
              <button
                type="button"
                disabled={busyId !== null || actingId !== null}
                onClick={() => act(c.id, () => onRestore(c.id))}
                className="min-h-11 px-3 rounded-lg border border-c-line text-xs text-c-ink hover:bg-c-accent-soft disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                Restore
              </button>
            </div>
          </li>
        ))}
      </ul>

      {panelError && <p className="text-xs text-danger mt-2">{panelError}</p>}
    </div>
  );
}
