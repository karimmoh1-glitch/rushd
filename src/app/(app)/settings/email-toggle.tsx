"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setEmailReminders } from "@/server/actions/settings";

export function EmailToggle({ on, available }: { on: boolean; available: boolean }) {
  // Flip the switch right away; it settles back to `on` if the save fails.
  const [enabled, setEnabled] = useOptimistic(on);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setEnabled(!enabled);
      const result = await setEmailReminders(!enabled);
      if ("error" in result) toast.error(result.error);
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id="email-reminders-label" className="text-sm font-medium">Study emails</p>
        <p className="text-sm text-muted-foreground">
          Your week ranked by Pulse every Sunday, and a nudge on evenings when a streak of 3+ days is about to end.
          {!available && " (Email isn't set up on this server yet.)"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="email-reminders-label"
        disabled={pending}
        onClick={handleClick}
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-border transition-colors aria-checked:border-transparent aria-checked:bg-primary disabled:opacity-60"
      >
        <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-transform ${enabled ? "translate-x-[22px] bg-primary-foreground" : "translate-x-0.5 bg-foreground/60"}`} />
      </button>
    </div>
  );
}
