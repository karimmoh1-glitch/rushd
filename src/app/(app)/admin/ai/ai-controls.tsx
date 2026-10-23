"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setAiEnabled, setAiMonthlyBudget } from "@/server/actions/admin";

function describeAiStatus(enabled: boolean, envKill: boolean): string {
  if (envKill) return "Off via AI_KILL_SWITCH=on in the environment.";
  if (enabled) return "On for everyone.";
  return "Paused for everyone.";
}

export function AiControls({ enabled, budget, envKill }: { enabled: boolean; budget: number; envKill: boolean }) {
  const [budgetInput, setBudgetInput] = useState(String(budget));
  const [pending, startTransition] = useTransition();

  function handleToggleClick() {
    if (enabled && !window.confirm("Pause every AI feature for all students?")) return;
    startTransition(async () => {
      await setAiEnabled(!enabled);
      toast.success(enabled ? "AI paused." : "AI resumed.");
    });
  }

  function handleBudgetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await setAiMonthlyBudget(Number(budgetInput));
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Monthly ceiling updated.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">AI features</p>
        <p className="text-xs text-muted-foreground">{describeAiStatus(enabled, envKill)}</p>
        <Button
          variant={enabled ? "outline" : "default"}
          disabled={pending || envKill}
          onClick={handleToggleClick}
        >
          {enabled ? "Pause all AI (circuit breaker)" : "Resume AI"}
        </Button>
      </div>
      <form className="space-y-1.5" onSubmit={handleBudgetSubmit}>
        <label htmlFor="budget" className="text-sm font-medium">Monthly spending ceiling (USD)</label>
        <div className="flex gap-2">
          <Input id="budget" type="number" min={0} step="1" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="w-32" />
          <Button type="submit" variant="outline" disabled={pending}>Save</Button>
        </div>
      </form>
    </div>
  );
}
