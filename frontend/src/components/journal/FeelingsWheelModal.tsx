"use client";

// The feelings wheel check-in (#79, user's design): three concentric rings (core ->
// secondary -> tertiary, the full Roberts wheel from lib/feelingsWheel.ts). Tap segments
// to multi-select; the Map of Consciousness score is DERIVED from the picks (average of
// each selected node's level), never self-tagged. Free words remain first-class alongside
// the wheel - the user leads the labeling.
//
// Selection is keyed by tree path (e.g. "2/1/0"), never by name: the Roberts wheel
// genuinely repeats four names in different sectors with different levels.

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { FEELINGS_WHEEL, MOC_ANCHORS, deriveMoc } from "@/lib/feelingsWheel";

interface Picked {
  key: string;
  name: string;
  moc: number;
}

interface Props {
  onSave: (words: string[], energy: number, mocLevel: number | null) => Promise<void>;
  onClose: () => void;
}

const SIZE = 460;
const CENTER = SIZE / 2;
// Ring radii: [inner, outer] for core / secondary / tertiary.
const RINGS: [number, number][] = [[46, 96], [98, 158], [160, 222]];
const LABEL_R = [72, 128, 190];

export default function FeelingsWheelModal({ onSave, onClose }: Props) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [words, setWords] = useState("");
  const [energy, setEnergy] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (key: string, name: string, moc: number) => {
    setPicked((prev) => {
      const i = prev.findIndex((p) => p.key === key);
      return i >= 0 ? prev.filter((p) => p.key !== key) : [...prev, { key, name, moc }];
    });
  };

  const derived = deriveMoc(picked.map((p) => p.moc));
  // Nearest anchor name gives the number meaning ("333 · near Willingness").
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

  const segments = useMemo(() => buildSegments(picked), [picked]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3 tl-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Log a mood check-in"
        className="w-full max-w-[480px] max-h-[94vh] overflow-y-auto rounded-2xl border border-j-line bg-j-card text-j-ink p-5 shadow-2xl tl-pop">
        <h2 className="font-mono text-[0.68rem] uppercase tracking-[0.13em] text-j-muted">
          Check in · how does it feel right now?
        </h2>
        <p className="text-xs text-j-muted mt-0.5">
          tap the wheel - core inside, nuance outside. Multi-select is fine.
        </p>

        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block w-full my-2" role="group" aria-label="Feelings wheel">
          {segments.map((s) => (
            <g key={s.key}>
              <path
                d={s.path}
                fill={s.fill}
                stroke={s.selected ? "var(--color-j-ink)" : "var(--color-j-card)"}
                strokeWidth={s.selected ? 2.2 : 1.1}
                opacity={s.selected ? 1 : 0.85}
                className="cursor-pointer hover:opacity-100 transition-opacity duration-150"
                onClick={() => toggle(s.key, s.name, s.moc)}
                role="checkbox"
                aria-checked={s.selected}
                aria-label={`${s.name}, level ${s.moc}`}
              >
                <title>{`${s.name} · MoC ${s.moc}`}</title>
              </path>
              <text
                x={s.lx}
                y={s.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={s.rotate ? `rotate(${s.rotate} ${s.lx} ${s.ly})` : undefined}
                fontSize={s.ring === 0 ? 11 : s.ring === 1 ? 8.6 : 7.2}
                fontWeight={s.ring === 0 ? 700 : 400}
                fill="#2E2A24"
                pointerEvents="none"
              >
                {s.name}
              </text>
            </g>
          ))}
        </svg>

        <div className="flex flex-wrap gap-1.5 min-h-7" aria-live="polite">
          {picked.length === 0 ? (
            <span className="font-mono text-[0.66rem] text-j-muted self-center">nothing picked yet</span>
          ) : (
            picked.map((p) => (
              <button key={p.key} onClick={() => toggle(p.key, p.name, p.moc)}
                className="rounded-full bg-j-accent-soft px-2.5 py-0.5 text-[0.8rem] font-medium text-j-accent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-j-accent"
                aria-label={`Deselect ${p.name}`}>
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

// ---------- wheel geometry ----------

interface Segment {
  key: string;
  name: string;
  moc: number;
  ring: 0 | 1 | 2;
  path: string;
  fill: string;
  lx: number;
  ly: number;
  rotate: number | null;
  selected: boolean;
}

function polar(r: number, a: number): [number, number] {
  return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)];
}

function annularSector(r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

// Lighten a hex color toward white (secondary/tertiary rings derive from the core hex).
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * f);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function label(ring: 0 | 1 | 2, mid: number): { lx: number; ly: number; rotate: number | null } {
  const [lx, ly] = polar(LABEL_R[ring], mid);
  if (ring === 0) return { lx, ly, rotate: null };
  // Rotate outer labels along their spoke; flip the left half so text stays upright.
  const deg = (mid * 180) / Math.PI;
  const flip = deg > 90 && deg < 270;
  return { lx, ly, rotate: flip ? deg + 180 : deg };
}

function buildSegments(picked: Picked[]): Segment[] {
  const selectedKeys = new Set(picked.map((p) => p.key));
  // Tertiary count drives the angular unit so leaf segments are equal width.
  const leaves = (children?: { length: number }) => children?.length || 1;
  const totalLeaves = FEELINGS_WHEEL.reduce(
    (n, core) => n + core.children.reduce((m, s) => m + leaves(s.children), 0), 0);
  const unit = (2 * Math.PI) / totalLeaves;

  const segments: Segment[] = [];
  let a = -Math.PI / 2;
  FEELINGS_WHEEL.forEach((core, ci) => {
    const coreSpan = core.children.reduce((m, s) => m + leaves(s.children), 0) * unit;
    const coreKey = `${ci}`;
    segments.push({
      key: coreKey, name: core.core, moc: core.moc, ring: 0,
      path: annularSector(RINGS[0][0], RINGS[0][1], a, a + coreSpan),
      fill: core.color,
      selected: selectedKeys.has(coreKey),
      ...label(0, a + coreSpan / 2),
    });
    let sa = a;
    core.children.forEach((sec, si) => {
      const secSpan = leaves(sec.children) * unit;
      const secKey = `${ci}/${si}`;
      segments.push({
        key: secKey, name: sec.name, moc: sec.moc, ring: 1,
        path: annularSector(RINGS[1][0], RINGS[1][1], sa, sa + secSpan),
        fill: shade(core.color, 0.35),
        selected: selectedKeys.has(secKey),
        ...label(1, sa + secSpan / 2),
      });
      (sec.children ?? []).forEach((ter, ti) => {
        const ta = sa + ti * unit;
        const terKey = `${ci}/${si}/${ti}`;
        segments.push({
          key: terKey, name: ter.name, moc: ter.moc, ring: 2,
          path: annularSector(RINGS[2][0], RINGS[2][1], ta, ta + unit),
          fill: shade(core.color, 0.55),
          selected: selectedKeys.has(terKey),
          ...label(2, ta + unit / 2),
        });
      });
      sa += secSpan;
    });
    a += coreSpan;
  });
  return segments;
}
