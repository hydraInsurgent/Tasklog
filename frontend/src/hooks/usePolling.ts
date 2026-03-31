"use client";

import { useEffect, useRef } from "react";

/**
 * Background data refresh on a timer.
 *
 * - Polls every `intervalMs` milliseconds by calling `fetchFn`.
 * - Pauses when the browser tab is hidden (Page Visibility API).
 * - Pauses when `enabled` is false (e.g. during in-flight operations).
 * - Fires an immediate fetch when the tab becomes visible again.
 */
export function usePolling(
  fetchFn: () => Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
) {
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    if (!enabled) return;

    // Start the polling interval.
    const id = setInterval(() => {
      if (!document.hidden) {
        fetchRef.current();
      }
    }, intervalMs);

    // When the tab becomes visible again, fire an immediate fetch.
    const onVisibilityChange = () => {
      if (!document.hidden) {
        fetchRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
