"use client";

// The feelings wheel check-in (#79, drill-down redesign in #85): instead of all 130
// feelings at once (which made tertiary slices ~12px on a phone), the wheel shows ONE
// level at a time, each filling the whole circle:
//
//   - the seven cores first ("the right word may not land at first - start coarse")
//   - tap a slice with finer shades  -> zoom INTO it (its children become the wheel)
//   - tap a deepest slice            -> that IS the pick
//   - tap the center while deep      -> pick the word you're standing on
//
// Picking LOGS the word and RESETS the wheel to the cores (user's design): a check-in
// usually combines feelings from different families, so after every pick you're already
// where the next search starts. Collected words show in the center at the cores level
// and as removable chips below. Back steps out one ring; "all" jumps home without picking.
//
// The Map of Consciousness score stays DERIVED from the picks (average of each picked
// node's level), never self-tagged; free words remain first-class alongside the wheel.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { FEELINGS_WHEEL, MOC_ANCHORS, WheelFeeling, deriveMoc } from "@/lib/feelingsWheel";

interface Picked {
  name: string;
  moc: number;
}

interface Props {
  onSave: (words: string[], energy: number, mocLevel: number | null) => Promise<void>;
  onClose: () => void;
}

const SIZE = 520;
const CENTER = SIZE / 2;
const R_INNER = 88;
const R_OUTER = 248;
const ANIM_MS = 220;

export default function FeelingsWheelModal({ onSave, onClose }: Props) {
  // Path into FEELINGS_WHEEL: [] = cores, [ci] = that core's secondaries, [ci, si] = tertiaries.
  const [path, setPath] = useState<number[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [words, setWords] = useState("");
  const [energy, setEnergy] = useState(5);
  const [saving, setSaving] = useState(false);
  // Crossfade direction while a level transition is animating ("deep" | "up" | null).
  const [anim, setAnim] = useState<"deep" | "up" | null>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, [onClose]);

  const navigate = (nextPath: number[], direction: "deep" | "up") => {
    setPath(nextPath);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnim(direction);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim(null), ANIM_MS);
  };

  // The finalized interaction: a pick logs the word and resets the wheel to the cores.
  const pick = (name: string, moc: number) => {
    setPicked((prev) => [...prev, { name, moc }]);
    navigate([], "up");
  };

  // ---------- current level ----------

  const { nodes, crumbs } = useMemo(() => {
    const crumbNames: string[] = [];
    let children: WheelFeeling[];
    if (path.length === 0) {
      children = FEELINGS_WHEEL.map((c) => ({ name: c.core, moc: c.moc, children: c.children }));
    } else {
      const core = FEELINGS_WHEEL[path[0]];
      crumbNames.push(core.core);
      children = core.children;
      if (path.length === 2) {
        const sec = children[path[1]];
        crumbNames.push(sec.name);
        children = sec.children ?? [];
      }
    }
    return { nodes: children, crumbs: crumbNames };
  }, [path]);

  const depth = path.length;
  const coreColor = depth ? FEELINGS_WHEEL[path[0]].color : null;
  const currentName = crumbs[crumbs.length - 1] ?? "";
  const currentMoc = depth === 1
    ? FEELINGS_WHEEL[path[0]].moc
    : depth === 2
      ? FEELINGS_WHEEL[path[0]].children[path[1]].moc
      : null;

  const tapSlice = (i: number) => {
    const node = nodes[i];
    if (!node.children || node.children.length === 0) {
      pick(node.name, node.moc); // deepest ring: the tap IS the pick
    } else {
      navigate([...path, i], "deep");
    }
  };

  const derived = deriveMoc(picked.map((p) => p.moc));
  const anchor = derived === null
    ? null
    : MOC_ANCHORS.reduce((best, a) =>
        Math.abs(a.level - derived) < Math.abs(best.level - derived) ? a : best);

  const save = async () => {
    const own = words.split(",").map((w) => w.trim()).filter(Boolean);
    const all = [...picked.map((p) => p.name.toLowerCase()), ...own];
    if (all.length === 0 || saving) return;
    setSaving(true);
    try {
      await onSave(all, energy, derived);
    } finally {
      setSaving(false);
    }
  };

  // Center summary at the cores level: the last few collected words.
  const centerPicks = picked.slice(-3);
  const centerExtra = picked.length - centerPicks.length;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3 tl-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Log a mood check-in"
        className="w-full max-w-[480px] lg:max-w-[640px] max-h-[94vh] overflow-y-auto rounded-2xl border border-j-line bg-j-card text-j-ink p-5 shadow-2xl tl-pop">
        <h2 className="font-mono text-[0.68rem] uppercase tracking-[0.13em] text-j-muted">
          Check in · how does it feel right now?
        </h2>

        {/* Back + breadcrumb: the way out is always visible */}
        <div className="flex items-center gap-2.5 mt-2 min-h-8">
          <button
            onClick={() => depth && navigate(path.slice(0, -1), "up")}
            disabled={!depth}
            aria-label="Back one level"
            className="inline-flex items-center gap-0.5 rounded-full border border-j-line px-2.5 py-1 text-[0.78rem] font-semibold text-j-accent disabled:opacity-35 cursor-pointer disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
          >
            <ChevronLeft size={13} aria-hidden="true" /> back
          </button>
          <span className="font-mono text-[0.7rem] text-j-muted truncate">
            <button
              onClick={() => depth && navigate([], "up")}
              disabled={!depth}
              className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent rounded ${depth ? "text-j-accent cursor-pointer hover:underline" : ""}`}
            >
              all
            </button>
            {depth === 0 && <span> feelings</span>}
            {crumbs.map((c, i) => (
              <span key={i}>
                {" › "}
                {i === crumbs.length - 1 ? <b className="text-j-ink">{c}</b> : c}
              </span>
            ))}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="block w-full my-1 motion-safe:transition-[transform,opacity] motion-safe:duration-200"
          role="group"
          aria-label={depth ? `Shades of ${currentName}` : "Core feelings"}
          style={{
            transformOrigin: "50% 50%",
            transform: anim === "deep" ? "scale(1.05)" : anim === "up" ? "scale(0.95)" : undefined,
            opacity: anim ? 0.4 : 1,
          }}
        >
          {nodes.map((node, i) => {
            const per = (2 * Math.PI) / nodes.length;
            const a0 = -Math.PI / 2 + i * per;
            const mid = a0 + per / 2;
            const hasChildren = !!node.children?.length;
            const fill = depth === 0 ? FEELINGS_WHEEL[i].color : shade(coreColor!, depth === 1 ? 0.32 : 0.52);
            const labelR = (R_INNER + R_OUTER) / 2 + (depth === 0 ? 4 : 0);
            const [lx, ly] = polar(labelR, mid);
            const [cx, cy] = polar(labelR + 30, mid);
            return (
              <g key={`${path.join("/")}-${i}`}>
                <path
                  d={annularSector(a0, a0 + per)}
                  fill={fill}
                  stroke="var(--color-j-card)"
                  strokeWidth={2}
                  className="cursor-pointer hover:brightness-105"
                  onClick={() => tapSlice(i)}
                  role="button"
                  aria-label={hasChildren ? `${node.name} - open ${node.children!.length} finer shades` : `Pick ${node.name}`}
                >
                  <title>{`${node.name} · MoC ${node.moc}${hasChildren ? ` · ${node.children!.length} deeper` : ""}`}</title>
                </path>
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fontSize={depth === 0 ? 18 : nodes.length > 7 ? 13 : 16}
                  fontWeight={600} fill="#2E2A24" pointerEvents="none">
                  {node.name}
                </text>
                {hasChildren && (
                  <text x={cx} y={cy} textAnchor="middle" fontSize={10}
                    fill="#2E2A24" opacity={0.55} fontFamily="monospace" pointerEvents="none">
                    {node.children!.length} deeper ›
                  </text>
                )}
              </g>
            );
          })}

          {/* Center: deep = pick the word you're on; at the cores = your collection so far */}
          <g
            className={depth ? "cursor-pointer" : undefined}
            onClick={() => depth && currentMoc !== null && pick(currentName, currentMoc)}
            role={depth ? "button" : undefined}
            aria-label={depth ? `Pick ${currentName}` : undefined}
          >
            <circle cx={CENTER} cy={CENTER} r={R_INNER - 10}
              fill="var(--color-j-card)"
              stroke={depth ? "var(--color-j-accent)" : "var(--color-j-line)"}
              strokeWidth={depth ? 1.8 : 1.5} />
            {depth > 0 ? (
              <>
                <text x={CENTER} y={CENTER - 8} textAnchor="middle" fontSize={17} fontWeight={700}
                  fill="var(--color-j-ink)" pointerEvents="none">{currentName}</text>
                <text x={CENTER} y={CENTER + 15} textAnchor="middle" fontSize={10.5}
                  fill="var(--color-j-accent)" pointerEvents="none">tap to pick this</text>
              </>
            ) : picked.length === 0 ? (
              <>
                <text x={CENTER} y={CENTER - 4} textAnchor="middle" fontSize={13} fontWeight={700}
                  fill="var(--color-j-ink)" pointerEvents="none">how does it</text>
                <text x={CENTER} y={CENTER + 14} textAnchor="middle" fontSize={13}
                  fill="var(--color-j-muted)" pointerEvents="none">feel right now?</text>
              </>
            ) : (
              <>
                <text x={CENTER} y={CENTER - centerPicks.length * 9 - 6} textAnchor="middle" fontSize={8.5}
                  fontFamily="monospace" fill="var(--color-j-muted)" pointerEvents="none">so far</text>
                {centerPicks.map((p, j) => (
                  <text key={j} x={CENTER} y={CENTER - centerPicks.length * 9 + 12 + j * 18}
                    textAnchor="middle" fontSize={13} fontWeight={600}
                    fill="var(--color-j-accent)" pointerEvents="none">{p.name}</text>
                ))}
                {centerExtra > 0 && (
                  <text x={CENTER} y={CENTER + centerPicks.length * 9 + 12} textAnchor="middle" fontSize={9.5}
                    fill="var(--color-j-muted)" pointerEvents="none">+{centerExtra} more</text>
                )}
              </>
            )}
          </g>
        </svg>

        <div className="flex flex-wrap gap-1.5 min-h-7" aria-live="polite">
          {picked.length === 0 ? (
            <span className="font-mono text-[0.66rem] text-j-muted self-center">nothing picked yet - tap a feeling to zoom in</span>
          ) : (
            picked.map((p, i) => (
              <button key={`${p.name}-${i}`} onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                className="rounded-full bg-j-accent-soft px-2.5 py-0.5 text-[0.8rem] font-medium text-j-accent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
                aria-label={`Remove ${p.name}`}>
                {p.name} <span className="opacity-60">{p.moc}</span>
              </button>
            ))
          )}
        </div>
        <p className="font-mono text-[0.7rem] text-j-muted mt-1.5 mb-2">
          Map of Consciousness: <b className="text-j-ink">{derived ?? "-"}</b>{" "}
          {derived !== null && anchor ? `· near ${anchor.name} · derived from your picks` : "· derived from your picks, not self-tagged"}
        </p>

        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="your own words too, if the wheel misses it"
          aria-label="Own mood words (comma separated)"
          className="w-full border-b border-j-line bg-transparent py-1.5 text-sm text-j-ink placeholder:text-j-muted/70 focus:border-j-accent focus:outline-none"
        />
        <div className="flex items-center gap-3 mt-3">
          <label htmlFor="energy-slider" className="font-mono text-[0.66rem] uppercase tracking-wide text-j-muted">energy</label>
          <input
            id="energy-slider"
            type="range"
            min={0}
            max={10}
            value={energy}
            onChange={(e) => setEnergy(Number(e.target.value))}
            className="flex-1 accent-[var(--color-j-accent)]"
          />
          <b className="text-sm [font-variant-numeric:tabular-nums] w-5 text-right">{energy}</b>
        </div>

        <div className="flex items-center mt-4">
          <button onClick={onClose} className="text-sm text-j-muted hover:text-j-ink cursor-pointer focus:outline-none focus:underline">
            cancel
          </button>
          <button
            onClick={save}
            disabled={saving || (picked.length === 0 && words.trim().length === 0)}
            aria-label="Save check-in"
            className="ml-auto grid place-items-center w-11 h-11 rounded-xl bg-j-accent text-j-paper cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-j-ink"
          >
            <Check size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- geometry ----------

function polar(r: number, a: number): [number, number] {
  return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)];
}

function annularSector(a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(R_OUTER, a0);
  const [x1, y1] = polar(R_OUTER, a1);
  const [x2, y2] = polar(R_INNER, a1);
  const [x3, y3] = polar(R_INNER, a0);
  return `M${x0},${y0} A${R_OUTER},${R_OUTER} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${R_INNER},${R_INNER} 0 ${large} 0 ${x3},${y3} Z`;
}

// Lighten the core hex toward white for deeper rings. Label ink stays a fixed dark
// (#2E2A24): slice fills are data-driven pastels, not theme tokens, so the label must
// not follow the dark-mode ink token (that would fail contrast on these light fills).
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * f);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
