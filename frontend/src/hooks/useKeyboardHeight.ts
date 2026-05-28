"use client";

import { useEffect, useState } from "react";

/* Returns the height of the virtual keyboard in pixels (0 when closed or when the
 * visualViewport API is unavailable). Ported from Tasklog Business (#73).
 *
 * Uses `window.visualViewport` rather than the viewport meta's `interactive-widget`
 * so it doesn't affect other fixed elements app-wide. Safe on SSR - the effect only
 * runs in the browser.
 *
 * Keyboard height = space between the bottom of the visual viewport and the bottom
 * of the layout viewport: keyboardH = innerHeight - (vv.offsetTop + vv.height).
 * Both `resize` and `scroll` fire on visualViewport because iOS Safari can shift
 * the viewport vertically (offsetTop changes) when the keyboard opens. */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function measure() {
      const h = window.innerHeight - (vv!.offsetTop + vv!.height);
      setKeyboardHeight(Math.max(0, Math.round(h)));
    }

    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    measure();

    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, []);

  return keyboardHeight;
}
