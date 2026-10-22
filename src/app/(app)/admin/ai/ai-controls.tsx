"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setAiEnabled, setAiMonthlyBudget } from "@/server/actions/admin";

export function AiControls({ enabled, budget, envKill }: { enabled: boolean; budget: number; envKill: boolean }) {
  const [value, setValue] = useState(String(budget));
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">AI features</p>
        <p className="text-xs text-muted-foreground">{envKill ? "Off via AI_KILL_SWITCH=on in the environment." : enabled ? "On for everyone." : "Paused for everyone."}</p>
        <Button
          variant={enabled ? "outline" : "default"}
          disabled={pending || envKill}
          onClick={() => {
            if (enabled && !window.confirm("Pause every AI feature for all students?")) return;
            startTransition(async () => {
              await setAiEnabled(!enabled);
              toast.success(enabled ? "AI paused." : "AI resumed.");
            });
          }}
        >
          {enabled ? "Pause all AI (circuit breaker)" : "Resume AI"}
        </Button>
      </div>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await setAiMonthlyBudget(Number(value));
            if ("error" in result) toast.error(result.error);
            else toast.success("Monthly ceiling updated.");
          });
        }}
      >
        <label htmlFor="budget" className="text-sm font-medium">Monthly spending ceiling (USD)</label>
        <div className="flex gap-2">
          <Input id="budget" type="number" min={0} step="1" value={value} onChange={(e) => setValue(e.target.value)} className="w-32" />
          <Button type="submit" variant="outline" disabled={pending}>Save</Button>
        </div>
      </form>
    </div>
  );
}
