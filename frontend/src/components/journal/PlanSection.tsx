"use client";

// Today's plan (#79): three buckets of REAL task references plus the derived
// "Unplanned, got done" bucket. The combobox searches open tasks as you type; the last
// row is always an explicit "+ Create task" action - never create on bare Enter, so
// half-thoughts don't become garbage tasks. A planned task that is still open and past
// its day shows its rolled-over state straight from task data (nothing hand-written).

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Task } from "@/lib/api";
import { PLAN_BUCKETS, PlanBucketKey, PlanContent } from "@/lib/journal";
import SectionCard from "./SectionCard";

interface Props {
  title: string;
  plan: PlanContent;
  tasksById: Map<number, Task>;
  unplanned: Task[];
  // Only today's plan is interactive for completion; past days render read-only state.
  isToday: boolean;
  onChange: (plan: PlanContent) => void;
  onCreateTask: (title: string) => Promise<Task>;
  onToggleTask: (id: number, isCompleted: boolean) => void;
  onSearch: (text: string) => Promise<Task[]>;
}

export default function PlanSection({
  title, plan, tasksById, unplanned, isToday, onChange, onCreateTask, onToggleTask, onSearch,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<PlanBucketKey>("non_negotiable");
  const [creating, setCreating] = useState(false);
  const [justAdded, setJustAdded] = useState<number | null>(null);

  const search = async (text: string) => {
    setQuery(text);
    setHits(text.trim() ? await onSearch(text) : []);
    setOpen(true);
  };

  const addToPlan = (taskId: number, created = false) => {
    onChange({
      buckets: { ...plan.buckets, [bucket]: [...plan.buckets[bucket], taskId] },
    });
    setQuery("");
    setHits([]);
    setOpen(false);
    if (created) {
      setJustAdded(taskId);
      setTimeout(() => setJustAdded(null), 4000);
    }
  };

  const create = async () => {
    if (!query.trim() || creating) return;
    setCreating(true);
    try {
      const task = await onCreateTask(query.trim());
      addToPlan(task.id, true);
    } finally {
      setCreating(false);
    }
  };

  const removeFromPlan = (bucketKey: PlanBucketKey, taskId: number) => {
    onChange({
      buckets: { ...plan.buckets, [bucketKey]: plan.buckets[bucketKey].filter((id) => id !== taskId) },
    });
  };

  return (
    <SectionCard title={title} marked>
      {PLAN_BUCKETS.map(({ key, title: bucketTitle }) => {
        const ids = plan.buckets[key];
        if (ids.length === 0 && key !== "non_negotiable") return null;
        return (
          <div key={key} className="mb-2.5">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.11em] text-j-muted mb-1">{bucketTitle}</p>
            {ids.length === 0 && <p className="text-sm text-j-muted/70 pl-0.5">nothing planned yet</p>}
            {ids.map((id) => {
              const task = tasksById.get(id);
              if (!task) {
                return (
                  <div key={id} className="flex items-center gap-2.5 py-1 text-sm text-j-muted italic">
                    (deleted task)
                    <button onClick={() => removeFromPlan(key, id)} className="text-xs underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded">remove</button>
                  </div>
                );
              }
              const rolled = !task.isCompleted && !isToday;
              return (
                <div key={id} className="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-j-accent-soft">
                  <button
                    role="checkbox"
                    aria-checked={task.isCompleted}
                    aria-label={`${task.isCompleted ? "Reopen" : "Complete"} ${task.title}`}
                    onClick={() => onToggleTask(task.id, !task.isCompleted)}
                    className={`grid place-items-center w-[18px] h-[18px] rounded-[5px] border-[1.6px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent ${
                      task.isCompleted ? "bg-j-accent border-j-accent text-j-paper" : "border-j-muted text-transparent"
                    }`}
                  >
                    <Check size={11} aria-hidden="true" />
                  </button>
                  <span className={`text-[0.95rem] ${task.isCompleted ? "line-through text-j-muted" : "text-j-ink"}`}>
                    {task.title}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {justAdded === task.id && (
                      <span className="font-mono text-[0.62rem] text-moc-high whitespace-nowrap">created · due today</span>
                    )}
                    {rolled && (
                      <span className="font-mono text-[0.62rem] text-j-muted whitespace-nowrap">rolled over</span>
                    )}
                    <button
                      onClick={() => removeFromPlan(key, task.id)}
                      aria-label={`Remove ${task.title} from the plan`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 font-mono text-[0.68rem] text-j-muted hover:text-danger cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded px-0.5"
                    >
                      ×
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Combobox: search or explicitly create. Bucket chips choose where it lands. */}
      <div className="mt-3">
        <div className="flex gap-1.5 mb-1.5" role="radiogroup" aria-label="Bucket for the new plan item">
          {PLAN_BUCKETS.map(({ key, title: t }) => (
            <button
              key={key}
              role="radio"
              aria-checked={bucket === key}
              onClick={() => setBucket(key)}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem] uppercase tracking-wide cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent ${
                bucket === key ? "border-j-accent text-j-accent bg-j-accent-soft" : "border-j-line text-j-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="type to add or find a task…"
            aria-label="Add or find a task for the plan"
            className="w-full rounded-lg border border-dashed border-j-line bg-j-paper px-3.5 py-2 text-sm text-j-ink placeholder:text-j-muted/70 focus:border-j-accent focus:border-solid focus:outline-none"
          />
          {open && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-j-line bg-j-card shadow-lg overflow-hidden">
              {hits.map((t) => (
                <button
                  key={t.id}
                  onMouseDown={(e) => { e.preventDefault(); addToPlan(t.id); }}
                  className="block w-full text-left px-3.5 py-2 text-sm hover:bg-j-accent-soft cursor-pointer"
                >
                  {t.title}
                </button>
              ))}
              <button
                onMouseDown={(e) => { e.preventDefault(); create(); }}
                disabled={creating}
                className="flex items-center gap-1.5 w-full text-left px-3.5 py-2 text-sm font-semibold text-j-accent border-t border-j-line hover:bg-j-accent-soft cursor-pointer disabled:opacity-60"
              >
                <Plus size={14} aria-hidden="true" />
                Create task: “{query.trim()}”
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Derived: completed on this date but never planned. Read-only by design. */}
      {unplanned.length > 0 && (
        <div className="mt-4 pt-3 border-t border-dashed border-j-line">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.11em] text-j-muted mb-1">
            Unplanned, got done <span className="normal-case tracking-normal">· derived</span>
          </p>
          {unplanned.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 py-1">
              <span className="grid place-items-center w-[18px] h-[18px] rounded-[5px] border-[1.6px] border-dashed border-j-muted text-j-muted">
                <Check size={11} aria-hidden="true" />
              </span>
              <span className="text-[0.95rem] text-j-muted line-through">{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
