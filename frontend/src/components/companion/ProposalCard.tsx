"use client";

// One inline proposal card (#87) - the trust loop in miniature: keep / quick-
// edit / toss (+ restore for a mis-tapped toss). Extracted from
// CompanionClient (review R16). State stays with the parent; this renders one
// capture and calls back.

import { useState } from "react";
import { type CaptureDto, type Project } from "@/lib/api";
import { COMPANION_NAME } from "@/lib/companion/meta";

export default function ProposalCard({
  capture,
  projects,
  actingId,
  onKeep,
  onToss,
  onRestore,
  onSaveEdit,
}: {
  capture: CaptureDto;
  projects: Project[];
  // A capture id with an action in flight ANYWHERE (inline card or rail panel).
  // Locks this card's buttons too, so a double-Keep across the two views cannot
  // fire two confirms (review R5 - the server also guards, this is the UX half).
  actingId: number | null;
  onKeep: (id: number) => Promise<void>;
  onToss: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onSaveEdit: (id: number, payload: CaptureDto["payload"]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(capture.payload.title ?? "");
  const [projectId, setProjectId] = useState<number | "">(
    capture.payload.projectId ?? "",
  );
  const [newProj, setNewProj] = useState(capture.payload.newProjectName ?? "");
  const [busy, setBusy] = useState<"keep" | "toss" | "save" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = busy !== null || actingId !== null;
  const resolved = capture.status !== "proposed";
  const project = projects.find(
    (p) => p.id === (editing ? projectId : capture.payload.projectId),
  );

  // Sage can update a proposed card mid-conversation (update_capture): sync the
  // edit fields from the fresh payload so opening Edit never shows stale values.
  const startEdit = () => {
    setTitle(capture.payload.title ?? "");
    setProjectId(capture.payload.projectId ?? "");
    setNewProj(capture.payload.newProjectName ?? "");
    setEditing(true);
  };

  const run = async (
    action: "keep" | "toss" | "save" | "restore",
    fn: () => Promise<void>,
  ) => {
    setBusy(action);
    setError(null);
    try {
      await fn();
      if (action === "save") setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong - retry.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`rounded-2xl border bg-c-card px-4 py-3 transition-opacity duration-200 ${
        resolved ? "opacity-60 border-c-line" : "border-c-accent/40"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-c-muted mb-1">
        {COMPANION_NAME} suggests a task
      </p>

      {editing ? (
        <div className="space-y-2">
          <div>
            <label htmlFor={`cap-title-${capture.id}`} className="block text-xs text-c-muted mb-1">
              Title
            </label>
            <input
              id={`cap-title-${capture.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-c-line bg-c-bg px-3 py-2 text-base text-c-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            />
          </div>
          {capture.payload.newProjectName !== undefined && (
            <div>
              <label htmlFor={`cap-newproj-${capture.id}`} className="block text-xs text-c-muted mb-1">
                New project (clear to use the dropdown instead)
              </label>
              <input
                id={`cap-newproj-${capture.id}`}
                value={newProj}
                onChange={(e) => setNewProj(e.target.value)}
                className="w-full rounded-lg border border-c-line bg-c-bg px-3 py-2 text-base text-c-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              />
            </div>
          )}
          <div>
            <label htmlFor={`cap-project-${capture.id}`} className="block text-xs text-c-muted mb-1">
              Project
            </label>
            <select
              id={`cap-project-${capture.id}`}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={newProj.trim() !== ""}
              className="w-full rounded-lg border border-c-line bg-c-bg px-3 py-2 text-base text-c-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent disabled:opacity-50"
            >
              <option value="">Inbox (no project)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.client ? ` - ${p.client.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={locked || title.trim() === ""}
              onClick={() =>
                run("save", () =>
                  // A typed new-project name wins; otherwise the dropdown choice
                  // applies and any stale newProjectName is dropped.
                  onSaveEdit(capture.id, {
                    ...capture.payload,
                    title: title.trim(),
                    ...(newProj.trim() !== ""
                      ? { newProjectName: newProj.trim(), projectId: undefined }
                      : {
                          newProjectName: undefined,
                          ...(projectId === "" ? { projectId: undefined } : { projectId }),
                        }),
                  }),
                )
              }
              className="min-h-11 px-4 rounded-lg bg-c-accent text-white text-sm font-medium disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            >
              {busy === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setEditing(false)}
              className="min-h-11 px-4 rounded-lg border border-c-line text-sm text-c-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-base font-medium text-c-ink">{capture.payload.title}</p>
          <p className="text-sm text-c-muted mt-0.5">
            {capture.payload.newProjectName ? (
              <>
                {capture.payload.newProjectName}{" "}
                <span className="text-c-accent">· new project</span>
              </>
            ) : project ? (
              project.name
            ) : (
              "Inbox"
            )}
            {capture.payload.deadline ? ` · due ${capture.payload.deadline.slice(0, 10)}` : ""}
          </p>
          {capture.span && (
            <p className="text-xs text-c-muted italic mt-1.5 line-clamp-2">
              &ldquo;{capture.span}&rdquo;
            </p>
          )}

          {resolved ? (
            // Resolved state: icon + word + color (never color alone).
            <p
              className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${
                capture.status === "confirmed" ? "text-success" : "text-c-muted"
              }`}
            >
              {capture.status === "confirmed" ? (
                <>
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
                    <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Added to your tasks
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Dismissed
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => run("restore", () => onRestore(capture.id))}
                    className="ml-1 min-h-11 px-3 rounded-lg border border-c-line text-sm text-c-ink cursor-pointer hover:bg-c-accent-soft transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
                  >
                    {busy === "restore" ? "..." : "Restore"}
                  </button>
                </>
              )}
            </p>
          ) : (
            <div className="flex gap-2 mt-2.5">
              <button
                type="button"
                disabled={locked}
                onClick={() => run("keep", () => onKeep(capture.id))}
                className="min-h-11 px-4 rounded-lg bg-c-accent text-white text-sm font-medium disabled:opacity-50 cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                {busy === "keep" ? "Adding..." : "Keep"}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={startEdit}
                className="min-h-11 px-4 rounded-lg border border-c-line text-sm text-c-ink cursor-pointer transition-colors duration-150 hover:bg-c-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => run("toss", () => onToss(capture.id))}
                className="min-h-11 px-4 rounded-lg text-sm text-c-muted cursor-pointer transition-colors duration-150 hover:bg-c-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-c-accent"
              >
                {busy === "toss" ? "..." : "Toss"}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger mt-2">{error}</p>}
    </div>
  );
}
