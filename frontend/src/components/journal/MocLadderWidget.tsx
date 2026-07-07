"use client";

// Map of Consciousness ladder (#85): a vertical reference for what the derived score
// MEANS. Major Hawkins anchors are labeled, minor ones are dots, and a marker shows
// where today sits (average of the day's check-in levels). Log-scaled: the scale packs
// its anchors low (20..200), so a linear axis would crush the region the user actually
// moves through.
//
// Honesty by design: the microcopy says "a lens, not a measurement". Hawkins' scale has
// no scientific validation - it is useful here as a personal ordinal ladder ("above or
// below the courage line today?"), never as an objective quantity.

import { MoodCheckinDto } from "@/lib/api";
import { MOC_ANCHORS } from "@/lib/feelingsWheel";
import SectionCard from "./SectionCard";

const W = 270;
const H = 240;
const TOP = 16;
const BOTTOM = H - 16;
const BAR_X = 46;
const MIN = 20;
const MAX = 700;

// Anchors that get a name; the rest render as dots (the user's "major vs minor").
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

export default function MocLadderWidget({ checkins }: { checkins: MoodCheckinDto[] }) {
  const levels = checkins.map((c) => c.mocLevel).filter((m): m is number => m !== null);
  const today = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null;
  const nearest = today === null
    ? null
    : MOC_ANCHORS.reduce((best, a) =>
        Math.abs(a.level - today) < Math.abs(best.level - today) ? a : best);

  return (
    <SectionCard title="Map of consciousness">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={today === null ? "Consciousness ladder - no picks today" : `Consciousness ladder - today around ${today}, near ${nearest?.name}`}>
        <defs>
          <linearGradient id="moc-ladder" x1="0" y1="1" x2="0" y2="0">
            {STOPS.map(([lvl, color]) => (
              <stop key={lvl} offset={(BOTTOM - y(lvl)) / (BOTTOM - TOP)} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        <rect x={BAR_X - 5} y={TOP} width={10} height={BOTTOM - TOP} rx={5} fill="url(#moc-ladder)" />

        {MOC_ANCHORS.map((a) => {
          const ay = y(a.level);
          const major = MAJOR.has(a.name);
          return (
            <g key={a.level}>
              <circle cx={BAR_X} cy={ay} r={major ? 2.6 : 1.6} fill="var(--color-j-card)" opacity={0.9} />
              {major && (
                <>
                  <line x1={BAR_X + 8} y1={ay} x2={BAR_X + 16} y2={ay} stroke="var(--color-j-line)" />
                  <text x={BAR_X + 20} y={ay + 3} fontSize={10} fill="var(--color-j-muted)">
                    {a.name} <tspan opacity={0.65} fontSize={8.5} fontFamily="monospace">{a.level}</tspan>
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* The courage line: Hawkins' threshold between draining and constructive levels */}
        <line x1={BAR_X - 14} y1={y(200)} x2={BAR_X + 6} y2={y(200)} stroke="var(--color-j-muted)" strokeDasharray="2 3" />

        {today !== null && nearest && (
          <g aria-hidden="true">
            <path d={`M${BAR_X - 22},${y(today) - 5} L${BAR_X - 12},${y(today)} L${BAR_X - 22},${y(today) + 5} Z`} fill="var(--color-j-accent)" />
            <circle cx={BAR_X} cy={y(today)} r={5} fill="none" stroke="var(--color-j-accent)" strokeWidth={2} />
            <text x={BAR_X - 26} y={y(today) + 3.5} fontSize={10.5} fontWeight={700} textAnchor="end" fill="var(--color-j-accent)">
              {today}
            </text>
          </g>
        )}
      </svg>
      <p className="font-mono text-[0.62rem] text-j-muted mt-1">
        {today === null
          ? "wheel picks place you on the ladder - log a check-in"
          : `today ~${today} · near ${nearest!.name} · avg of ${levels.length} pick${levels.length > 1 ? "ed check-ins" : "ed check-in"}`}
        {" · a lens, not a measurement"}
      </p>
    </SectionCard>
  );
}
