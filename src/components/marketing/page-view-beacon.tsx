"use client";

import { useEffect } from "react";

/** Counts one view of a public page: no cookies, no identifiers, no third parties. */
export function PageViewBeacon({ path }: { path: string }) {
  useEffect(() => {
    try {
      if (!navigator.sendBeacon?.("/api/pv", path)) void fetch("/api/pv", { method: "POST", body: path, keepalive: true });
    } catch {
      // Analytics must never affect the page.
    }
  }, [path]);
  return null;
}
