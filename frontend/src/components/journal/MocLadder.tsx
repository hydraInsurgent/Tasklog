"use client";

// Map of Consciousness reference ladder (#85): opened from the info button beside the
// derived score in the check-in popup - a reference for what the number MEANS, shown
// at the moment of tagging rather than as an ambient widget. Major Hawkins anchors are
// labeled, minor ones are dots, and a marker shows the current derived position.
// Log-scaled: the scale packs its anchors low (20..200), so a linear axis would crush
// the region the user actually moves through.
//
// Honesty by design: the caption says "a lens, not a measurement". Hawkins' scale has
// no scientific validation - it is useful as a personal ordinal ladder ("above or
// below the courage line right now?"), never as an objective quantity.

import { MOC_ANCHORS } from "@/lib/feelingsWheel";

const W = 300;
const H = 420;
const TOP = 20;
const BOTTOM = H - 20;
const BAR_X = 64;
const MIN = 20;
const MAX = 700;

// Anchors that get a name; the rest render as dots.
const MAJOR = new Set(["Shame", "Fear", "Anger", "Courage", "Willingness", "Acceptance", "Reason", "Love", "Peace", "Enlightenment"]);

// Classic ladder coloring, bottom to top: red through amber at the courage line,
// green through the expansive levels, violet at the top.
const STOPS: [number, string][] = [
  [20, "#bf463e"], [100, "#c96a35"], [175, "#ce9433"], [200, "#a3a339"],
  [350, "#4e9a62"], [540, "#3f7f96"], [700, "#6d5a9e"],
];

function y(level: number): number {
  const t = Math.log(level / MIN) / Math.log(MAX / MIN);
  return BOTTOM - t * (BOTTOM - TOP);
}

export default function MocLadder({ current }: { current: number | null }) {
  const nearest = current === null
    ? null
    : MOC_ANCHORS.reduce((best, a) =>
        Math.abs(a.level - current) < Math.abs(best.level - current) ? a : best);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={current === null ? "Consciousness ladder reference" : `Consciousness ladder - currently around ${current}, near ${nearest?.name}`}>
        <defs>
          <linearGradient id="moc-ladder" x1="0" y1="1" x2="0" y2="0">
            {STOPS.map(([lvl, color]) => (
              <stop key={lvl} offset={(BOTTOM - y(lvl)) / (BOTTOM - TOP)} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        <rect x={BAR_X - 7} y={TOP} width={14} height={BOTTOM - TOP} rx={7} fill="url(#moc-ladder)" />

        {MOC_ANCHORS.map((a) => {
          const ay = y(a.level);
          const major = MAJOR.has(a.name);
          return (
            <g key={a.level}>
              <circle cx={BAR_X} cy={ay} r={major ? 3.2 : 2} fill="var(--color-j-card)" opacity={0.9} />
              {major && (
                <>
                  <line x1={BAR_X + 10} y1={ay} x2={BAR_X + 20} y2={ay} stroke="var(--color-j-line)" />
                  <text x={BAR_X + 25} y={ay + 4} fontSize={12.5} fill="var(--color-j-ink)">
                    {a.name} <tspan opacity={0.55} fontSize={10.5} fontFamily="monospace">{a.level}</tspan>
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* The courage line: Hawkins' threshold between draining and constructive levels */}
        <line x1={BAR_X - 20} y1={y(200)} x2={BAR_X + 8} y2={y(200)} stroke="var(--color-j-muted)" strokeDasharray="2 3" />
        <text x={BAR_X - 24} y={y(200) - 6} fontSize={9} fontFamily="monospace" textAnchor="end" fill="var(--color-j-muted)"
          transform={`rotate(-90 ${BAR_X - 24} ${y(200) - 6})`}>
          courage line
        </text>

        {current !== null && (
          <g aria-hidden="true">
            <path d={`M${BAR_X - 28},${y(current) - 6} L${BAR_X - 16},${y(current)} L${BAR_X - 28},${y(current) + 6} Z`} fill="var(--color-j-accent)" />
            <circle cx={BAR_X} cy={y(current)} r={6.5} fill="none" stroke="var(--color-j-accent)" strokeWidth={2.4} />
            <text x={BAR_X - 33} y={y(current) + 4} fontSize={13} fontWeight={700} textAnchor="end" fill="var(--color-j-accent)">
              {current}
            </text>
          </g>
        )}
      </svg>
      <p className="font-mono text-[0.64rem] text-j-muted mt-1.5">
        {current === null
          ? "pick feelings on the wheel to place yourself"
          : `current picks average ~${current} · near ${nearest!.name}`}
        {" · a lens, not a measurement"}
      </p>
    </div>
  );
}
