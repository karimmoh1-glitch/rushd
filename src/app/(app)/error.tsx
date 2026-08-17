"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Scoped to the authenticated app section — catches a render or data-fetch
// failure on any dashboard/plan/assignments/etc. page instead of the whole
// tab going white. Deliberately does not surface error.message to the
// student (could leak internals); logs it to the console for now — wiring
// this into a real error-monitoring service (Sentry or similar) is the
// natural next step once there's an account for one. See docs/ROADMAP.md.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h1 className="mt-4 font-heading text-xl font-semibold">Something went wrong.</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This is on us, not you — nothing you did caused this. Try again, or head back home.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard">
          <Button variant="outline">Go home</Button>
        </Link>
      </div>
    </div>
  );
}
