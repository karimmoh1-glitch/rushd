"use client";

import { useState, useTransition } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { submitFeedback } from "@/server/actions/feedback";

// A quick yes/no on one feature. Saved as normal feedback (rating 5 or 1 with a
// "<feature>_helpful" context), so it shows up in /admin without a new table.
export function HelpfulWidget({ feature, label = "Was this helpful?" }: { feature: string; label?: string }) {
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(helpful: boolean) {
    if (answered || pending) return;
    setAnswered(helpful ? "yes" : "no");
    startTransition(async () => {
      await submitFeedback({ context: `${feature}_helpful`, rating: helpful ? 5 : 1 });
    });
  }

  if (answered) {
    return (
      <p className="text-xs text-muted-foreground">
        {answered === "yes" ? "Glad it helped." : "Thanks — noted."}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => vote(true)}
        aria-label="Yes, this was helpful"
        className="rounded p-1 hover:bg-muted hover:text-foreground"
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => vote(false)}
        aria-label="No, this was not helpful"
        className="rounded p-1 hover:bg-muted hover:text-foreground"
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
