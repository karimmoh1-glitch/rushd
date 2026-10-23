"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updatePlanningPreferences } from "@/server/actions/settings";
import { SESSION_LENGTH_OPTIONS } from "@/lib/planning/constants";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAILY_OPTIONS = [60, 90, 120, 180, 240, 300, 360, 480];

// Keep a saved value that isn't one of the presets in the list, in order.
function dailyOptionsIncluding(current: number): number[] {
  if (DAILY_OPTIONS.includes(current)) return DAILY_OPTIONS;
  return [...DAILY_OPTIONS, current].sort((a, b) => a - b);
}

export function PlanningForm({
  initial,
}: {
  initial: { preferredSessionMinutes: number; maxDailyMinutes: number };
}) {
  const [session, setSession] = useState(initial.preferredSessionMinutes);
  const [daily, setDaily] = useState(initial.maxDailyMinutes);
  const [pending, startTransition] = useTransition();
  const dirty = session !== initial.preferredSessionMinutes || daily !== initial.maxDailyMinutes;

  function save() {
    startTransition(async () => {
      const result = await updatePlanningPreferences({
        preferredSessionMinutes: session as 30 | 45 | 60 | 90,
        maxDailyMinutes: daily,
      });
      if ("error" in result) toast.error(result.error);
      else toast.success("Planning preferences saved. Your plan has been rebuilt.");
    });
  }

  const dailyOptions = dailyOptionsIncluding(daily);

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Study block length</legend>
        <p className="text-xs text-muted-foreground">How long you like to focus before a break.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {SESSION_LENGTH_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={session === m}
              onClick={() => setSession(m)}
              className={cn(
                "rounded-lg border px-3.5 py-2 font-mono text-sm tabular-nums transition-colors",
                session === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {formatDuration(m)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="max-daily">Most study Rushd should plan in one day</Label>
        <select
          id="max-daily"
          value={daily}
          onChange={(e) => setDaily(Number(e.target.value))}
          className="h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          {dailyOptions.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          If deadlines need more than this, Rushd flags it on your plan instead of overloading the day.
        </p>
      </div>

      <Button onClick={save} disabled={!dirty || pending}>
        {pending ? "Saving..." : "Save preferences"}
      </Button>
    </div>
  );
}
