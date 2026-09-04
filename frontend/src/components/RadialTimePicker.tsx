"use client";

// A radial (clock-dial) 12-hour time picker (#86). Replaces the native <input type="time">
// dropdown so start/end selection is consistent on desktop and mobile. Tap the hour ring,
// then the minute ring (5-min marks - matching the app's 5-min grid), with an AM/PM toggle.
// Value is a 24h "HH:mm" string; onChange emits the same. The dial is portaled + centered
// (bottom sheet on mobile) so it always fits the viewport and sits above the edit sheet.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

function parse(v: string): { h24: number; m: number } {
  const [h, m] = v.split(":");
  return { h24: Number(h) || 0, m: Number(m) || 0 };
}
const p2 = (n: number) => String(n).padStart(2, "0");
const to24 = (h12: number, ap: "AM" | "PM") => (ap === "AM" ? h12 % 12 : (h12 % 12) + 12);

export default function RadialTimePicker({
  value, onChange, disabled, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"h" | "m">("h");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { h24, m } = parse(value);
  const ampm: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const commit = (nh24: number, nm: number) => onChange(`${p2(nh24)}:${p2(nm)}`);
  const pickHour = (hh: number) => { commit(to24(hh, ampm), m); setMode("m"); };
  const pickMinute = (mm: number) => { commit(h24, mm); setOpen(false); setMode("h"); };
  const setAmPm = (ap: "AM" | "PM") => commit(to24(h12, ap), m);

  const items = mode === "h"
    ? Array.from({ length: 12 }, (_, i) => i + 1)   // 1..12
    : Array.from({ length: 12 }, (_, i) => i * 5);  // 0,5,...,55
  const selected = mode === "h" ? h12 : m;

  const R = 92, C = 120; // ring radius + center of the 240px dial
  const pos = (i: number) => {
    const a = (i * 30 - 90) * (Math.PI / 180); // 12 slots, 12 o'clock at top
    return { left: C + R * Math.cos(a), top: C + R * Math.sin(a) };
  };

  const dial = (
    <>
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => { setOpen(false); setMode("h"); }} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Pick a time"
        className="fixed z-[71] inset-x-0 bottom-0 sm:inset-x-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[320px] bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4"
      >
        {/* Selected time + hour/minute focus + AM/PM */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="text-3xl font-semibold tabular-nums text-text-primary">
            <button
              type="button"
              onClick={() => setMode("h")}
              className={`px-1 rounded focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer ${mode === "h" ? "text-accent" : ""}`}
            >
              {h12}
            </button>
            <span>:</span>
            <button
              type="button"
              onClick={() => setMode("m")}
              className={`px-1 rounded focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer ${mode === "m" ? "text-accent" : ""}`}
            >
              {p2(m)}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {(["AM", "PM"] as const).map((ap) => (
              <button
                key={ap}
                type="button"
                onClick={() => setAmPm(ap)}
                className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 ${
                  ampm === ap ? "bg-primary text-white border-primary" : "border-border text-text-muted hover:text-text-primary"
                }`}
              >
                {ap}
              </button>
            ))}
          </div>
        </div>

        {/* The dial */}
        <div className="relative mx-auto rounded-full bg-surface-raised" style={{ width: 240, height: 240 }}>
          <span className="absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" aria-hidden="true" />
          {items.map((n, i) => {
            const { left, top } = pos(i);
            const isSel = n === selected;
            return (
              <button
                key={n}
                type="button"
                onClick={() => (mode === "h" ? pickHour(n) : pickMinute(n))}
                style={{ left, top }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-sm tabular-nums cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-100 ${
                  isSel ? "bg-primary text-white" : "text-text-primary hover:bg-border"
                }`}
              >
                {mode === "h" ? n : p2(n)}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => { setOpen(false); setMode("h"); }}
            className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(true); setMode("h"); }}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <Clock size={14} aria-hidden="true" className="text-text-muted shrink-0" />
        <span className="tabular-nums">{h12}:{p2(m)} {ampm}</span>
      </button>
      {open && mounted && createPortal(dial, document.body)}
    </>
  );
}
