"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dismissPlanChange } from "@/server/actions/plan-overrides";

/** "What changed" after the plan was regenerated: one to three specific
 * sentences, each from the plan diff (src/lib/planning/diff.ts). */
export function WhatChanged({ planId, sentences, headingId = "what-changed" }: { planId: string; sentences: string[]; headingId?: string }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  if (hidden || sentences.length === 0) return null;

  function dismiss() {
    startTransition(async () => {
      const result = await dismissPlanChange(planId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setHidden(true);
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-5"
    >
      <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="text-[13px] font-semibold tracking-tight">
          What changed
        </h2>
        <ul className="mt-1 space-y-1 text-sm text-foreground/85">
          {sentences.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      </div>
      <Button variant="ghost" size="sm" className="-my-1 shrink-0" onClick={dismiss} disabled={pending}>
        Got it
      </Button>
    </section>
  );
}
