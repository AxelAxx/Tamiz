"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs` while `enabled`: relative times ("3 s
 * ago") stay true without a refetch. One hook for every screen (code audit 2026-11-03, L14).
 */
export function useNow(intervalMs = 1_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}
