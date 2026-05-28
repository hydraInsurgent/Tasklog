"use client";

/* Responsive container for chip-driven pickers (ported from Tasklog Business, #73).
 *
 * Two layouts driven by the `sm` breakpoint (640px):
 *   - desktop (sm+): anchored popover below the trigger via getBoundingClientRect();
 *     flips above if it doesn't fit. No backdrop - click-outside closes; the page
 *     stays interactive so the picker doesn't feel modal.
 *   - mobile (<sm): bottom-sheet sliding up from the bottom, with a dimming backdrop,
 *     a drag-handle affordance, and an iOS safe-area-bottom inset.
 *
 * Both share: Escape closes, body-scroll-lock + overscroll-contain while open (mobile),
 * focus into the panel on open + return focus to the trigger on close. Mounts via
 * createPortal to document.body so the popover isn't clipped by overflow ancestors.
 *
 * NOTE (#73 Stage A): the entry-animation classes (animate-in / zoom-in-95 /
 * slide-in-from-bottom) come from tw-animate-css, not yet wired in this project, so
 * they are currently inert (no error). Stage B wires the animation (or swaps to a
 * plain CSS transition) when the sheet first renders. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type PickerSheetProps = {
  open: boolean;
  /* The chip that opened the picker. Used for positioning on desktop and to return
   * focus when the picker closes. */
  triggerRef: React.RefObject<HTMLElement | null>;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

/* Margin between the popover and the viewport edges. */
const POPOVER_MARGIN = 16;

type Position = {
  top: number;
  left: number;
  width: number;
  /* When true, the popover renders ABOVE the trigger (not enough room below);
   * `top` is then the popover's top in viewport coords. */
  above: boolean;
  /* Cap used in maxHeight so the panel never overflows the viewport. */
  maxH: number;
};

export default function PickerSheet({ open, triggerRef, title, onClose, children }: PickerSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  /* Two booleans rather than one "mode": SSR has no window. Default to desktop and
   * let the effect correct it once mounted. */
  const [isDesktop, setIsDesktop] = useState(true);

  /* Track viewport size so we can switch layouts on rotate / resize. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* Compute popover position from the trigger rect. Callable on open AND on resize/
   * scroll without duplicating the geometry. */
  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(360, vw - POPOVER_MARGIN * 2);
    /* Open below by default with a 4px gap; flip above if there's < ~200px below. */
    const spaceBelow = vh - rect.bottom - POPOVER_MARGIN;
    const spaceAbove = rect.top - POPOVER_MARGIN;
    const flipAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

    const top = flipAbove ? Math.max(POPOVER_MARGIN, rect.top - 4) : rect.bottom + 4;
    const rawLeft = rect.left;
    const left = Math.max(POPOVER_MARGIN, Math.min(rawLeft, vw - width - POPOVER_MARGIN));
    const maxH = flipAbove ? rect.top - POPOVER_MARGIN - 4 : vh - rect.bottom - POPOVER_MARGIN - 4;

    setPos({ top, left, width, above: flipAbove, maxH });
  }, [triggerRef]);

  /* Recompute on open (layoutEffect runs before paint so the panel doesn't jump). */
  useLayoutEffect(() => {
    if (!open || !isDesktop) return;
    computePosition();
  }, [open, isDesktop, computePosition]);

  /* Reposition on resize AND on scroll (capture, to catch ancestor scroll containers)
   * so the popover stays glued to the chip. */
  useEffect(() => {
    if (!open || !isDesktop) return;
    const reposition = () => computePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, { capture: true } as EventListenerOptions);
    };
  }, [open, isDesktop, computePosition]);

  /* Escape closes. */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Desktop: click-outside closes. Mobile uses the backdrop handler instead. */
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inTrigger = triggerRef.current?.contains(target);
      if (!inPanel && !inTrigger) onClose();
    }
    /* Defer to the next tick so the click that opened us doesn't immediately close us. */
    const id = window.setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open, isDesktop, onClose, triggerRef]);

  /* Body scroll lock - mobile only. The bottom sheet covers most of the viewport;
   * locking body scroll prevents swipes inside the sheet chaining to the page once
   * it hits its scroll boundary (paired with overscroll-contain on the panel).
   * Desktop is intentionally NOT locked (the small popover stays glued via the
   * scroll listener above). Compensate for scrollbar width to avoid a layout shift. */
  useEffect(() => {
    if (!open || isDesktop) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, isDesktop]);

  /* Focus management: focus the first focusable in the panel on open; return focus to
   * the trigger on close. */
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    /* Wait one tick for the portal to mount before reaching into it. */
    const id = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      trigger?.focus?.();
    };
  }, [open, triggerRef]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <h2 id="picker-sheet-title" className="font-heading text-base font-semibold text-text-primary">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-text-muted hover:text-text-primary p-1 rounded focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 cursor-pointer"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );

  if (isDesktop) {
    /* Gate the portal render on a measured position so the entry animation always
     * starts from the final coordinates (not the top-left corner). */
    if (!pos) return null;
    return createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="picker-sheet-title"
        style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: `${pos.maxH}px` }}
        className="z-[9999] overflow-y-auto overscroll-contain bg-surface border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-150"
      >
        {header}
        <div className="px-4 py-3">{children}</div>
      </div>,
      document.body,
    );
  }

  /* Mobile bottom-sheet. The backdrop is its own fixed layer so taps outside the
   * sheet close it without scanning composed paths. */
  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="picker-sheet-title"
        className="fixed inset-x-0 bottom-0 z-[9999] max-h-[85vh] overflow-y-auto overscroll-contain bg-surface border-t border-border rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200 pb-[env(safe-area-inset-bottom,0)]"
      >
        {/* Drag handle - decorative affordance (not yet swipe-to-dismiss). */}
        <div className="flex justify-center pt-2 pb-1">
          <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-border" />
        </div>
        {header}
        <div className="px-4 py-3">{children}</div>
      </div>
    </>,
    document.body,
  );
}
