"use client";

/* Pill-button surface for a TaskSheet field chip (ported from Tasklog Business, #73).
 *
 * One chip = one field. The chip shows the current value (or a placeholder label
 * when unset) and opens its picker on click. Two things over a plain decorative
 * span: a focus ring + a 44x44 touch target, so it behaves as a proper
 * interactive control on touch + keyboard. Colors are driven by the semantic
 * tokens (bg-surface / border-accent / text-text-primary ...) so theming is
 * centralized. */

import React, { forwardRef } from "react";

type ChipProps = {
  icon?: React.ReactNode;
  /* Smaller, muted placeholder shown when no value is set. Suppressed once a
   * `value` is provided - the value carries the meaning. */
  label?: string;
  value?: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  /* Style hint: this chip's picker is currently open. Bumps the background +
   * border so users can see which chip "owns" the on-screen picker. */
  active?: boolean;
  /* Optional explicit ref to the underlying <button>. Passed via prop (in
   * addition to React.forwardRef) so callers can hand a useRef'd anchor to
   * PickerSheet for popover positioning. */
  chipRef?: React.RefObject<HTMLButtonElement | null>;
  /* Extra classes appended to the button (e.g. flex-1 min-w-0 in a chip row). */
  className?: string;
};

const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { icon, label, value, onClick, ariaLabel, disabled = false, active = false, chipRef, className = "" },
  forwardedRef,
) {
  const hasValue = value !== undefined && value !== null && value !== "";

  /* Screen-reader name: fall back to the visible text so the announcement
   * matches the eye. */
  const computedAria =
    ariaLabel ?? (typeof value === "string" && value ? value : label ?? "Open picker");

  /* Active state uses bg-surface + border-accent rather than an accent fill: the
   * chip is still neutral content, not a "selected" primary action. The accent
   * border is enough to show which picker is open. */
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-full border text-sm px-3 py-1.5 " +
    "min-h-[44px] transition-colors duration-150 " +
    "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2";

  const colour = active
    ? "bg-surface border-accent text-text-primary"
    : hasValue
      ? "bg-surface-raised border-border text-text-primary hover:bg-surface"
      : "bg-surface-raised border-border text-text-muted hover:text-text-primary";

  const disabledCls = disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer";

  /* Bridge forwardRef + the explicit chipRef prop to the same <button>. */
  const setRef = (node: HTMLButtonElement | null) => {
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    if (chipRef) chipRef.current = node;
  };

  return (
    <button
      ref={setRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={computedAria}
      aria-pressed={active}
      className={`${base} ${colour} ${disabledCls} ${className}`}
    >
      {icon && (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          {icon}
        </span>
      )}
      {hasValue ? <span className="truncate">{value}</span> : label && <span className="truncate">{label}</span>}
    </button>
  );
});

export default Chip;
