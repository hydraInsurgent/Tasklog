"use client";

import { useState, FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Comment, addComment, deleteComment } from "@/lib/api";

interface Props {
  taskId: number;
  // Server-rendered initial comments (from getTask), newest first.
  initialComments: Comment[];
}

// Comments section for the task detail page. The detail page is a Server
// Component, so the interactive add/delete lives here as a Client Component.
export default function TaskComments({ taskId, initialComments }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const created = await addComment(taskId, trimmed);
      // Newest first.
      setComments((prev) => [created, ...prev]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteComment(taskId, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete comment.");
    }
  }

  function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return (
    <div className="px-6 py-4 border-t border-border-muted">
      <p className="text-sm font-medium text-text-muted mb-3">Comments</p>

      <form onSubmit={handleAdd} className="mb-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          rows={2}
          maxLength={2000}
          placeholder="Add a note..."
          aria-label="Add a comment"
          className="w-full px-3 py-2 border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow duration-150 resize-y"
        />
        <div className="mt-2 flex items-center justify-between">
          {error ? (
            <span className="text-sm text-danger" role="alert">{error}</span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="flex items-center gap-2 px-3 py-1.5 min-h-[36px] bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Add comment
          </button>
        </div>
      </form>

      {comments.length === 0 ? (
        <p className="text-sm text-text-muted">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="group flex items-start justify-between gap-2 rounded-md bg-surface-raised px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{c.body}</p>
                <p className="mt-0.5 text-xs text-text-muted">{formatWhen(c.createdAt)}</p>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                aria-label="Delete comment"
                className="shrink-0 text-zinc-300 hover:text-danger focus:outline-none focus:text-danger transition-colors duration-150 cursor-pointer"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
