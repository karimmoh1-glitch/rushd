"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrokenPath } from "@/components/brand/path-empty";

// Catches errors on any signed-in app page so the whole tab doesn't go white.
// error.message is never shown to the student (it could leak internals); it is only logged.
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
