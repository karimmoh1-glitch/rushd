// Small motion helpers shared by the marketing demos.

import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * False on the server and on the first client render, true after hydration.
 * Lets a component render its "finished" state on the server, then animate.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

/**
 * Whether the visitor asked for reduced motion. Starts false (so the server
 * and first client render match) and follows the setting after that.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduceMotion(query.matches);

    function handleChange() {
      setReduceMotion(query.matches);
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduceMotion;
}

/** A one-time check, for code that only needs to know at a single moment. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Ease-out cubic: fast at the start, gentle at the end. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
