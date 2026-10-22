"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrokenPath } from "@/components/brand/path-empty";

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
      <BrokenPath />
      <h1 className="mt-6 text-[1.75rem] font-medium leading-tight tracking-tight">Something went wrong.</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This one is on us, not you. Try again, or head back to Today.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Go to Today
        </Link>
      </div>
    </div>
  );
}
