"use client";

import { useEffect } from "react";
import { countOnce } from "@/lib/analytics/beacon";

/** Counts one visit to a public page per browser per day: no cookies, no identifiers, no third parties. */
export function PageViewBeacon({ path }: { path: string }) {
  useEffect(() => {
    countOnce(path);
  }, [path]);
  return null;
}
