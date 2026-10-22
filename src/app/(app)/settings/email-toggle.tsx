"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setEmailReminders } from "@/server/actions/settings";

export function EmailToggle({ on, available }: { on: boolean; available: boolean }) {
  const [value, setValue] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
      <div>
        <p id="email-reminders-label" className="font-medium">Study emails</p>
        <p className="text-sm text-muted-foreground">
          Your week ranked by Pulse every Sunday, and a nudge on evenings when a streak of 3+ days is about to end.
          {!available && " (Email isn't set up on this server yet.)"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby="email-reminders-label"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setValue(!value);
            const r = await setEmailReminders(!value);
            if ("error" in r) toast.error(r.error);
          })
        }
        className="relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors aria-checked:border-transparent aria-checked:bg-primary disabled:opacity-60"
      >
        <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-transform ${value ? "translate-x-[22px] bg-primary-foreground" : "translate-x-0.5 bg-foreground/60"}`} />
      </button>
    </div>
  );
}
