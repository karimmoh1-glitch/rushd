"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setAssignmentStatus } from "@/server/actions/assignments";
import { logPlanItemInteraction } from "@/server/actions/plan-item-events";
import { StartSessionButton } from "@/components/start-session-button";
import { formatDuration } from "@/lib/format";
import { PulseBadge } from "@/components/brand/pulse-badge";

/** The single recommended next action: what to open now, and why. */
export function NextUp({
  itemId,
  itemKind,
  assignmentId,
  title,
  className,
  classColor,
  minutes,
  pulse,
  when,
  reasons,
}: {
  pulse: number;
  itemId: string;
  itemKind: "assignment" | "exam";
  assignmentId: string | null;
  title: string;
  className: string;
  classColor: string;
  minutes: number;
  /** e.g. "Planned today at 4:00 PM"; omitted when it isn't scheduled. */
  when?: string;
  reasons: string[];
}) {
  const [pending, startTransition] = useTransition();

  function complete() {
    if (!assignmentId) return;
    startTransition(async () => {
      const result = await setAssignmentStatus(assignmentId, "COMPLETED");
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      await logPlanItemInteraction("completed", itemId, itemKind);
      toast.success("Marked done.");
    });
  }

  return (
    <section
      aria-labelledby="next-up"
      style={{ ["--course" as string]: classColor }}
      className="course-tint relative overflow-hidden rounded-2xl p-5 pl-6 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:p-7 sm:pl-8"
    >
      <span aria-hidden="true" className="course-rule absolute inset-y-0 left-0 w-1" />
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-up" className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
          Next up
        </h2>
        <PulseBadge pulse={pulse} showLabel live />
      </div>
      <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-[1.75rem] font-medium leading-[1.1] tracking-tight text-balance sm:text-[2.125rem]">
            {title}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="course-ink font-medium">{className}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatDuration(minutes)} left</span>
            {when && (
              <>
                <span aria-hidden="true">·</span>
                <span>{when}</span>
              </>
            )}
          </p>
          {reasons.length > 0 && (
            <ul className="mt-4 max-w-prose space-y-1.5 text-sm text-foreground/85">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-2.5">
                  <span aria-hidden="true" className="course-rule mt-[0.5rem] h-1 w-1 shrink-0 rounded-full" />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 [&>button]:flex-1 md:[&>button]:flex-none">
          <StartSessionButton
            target={assignmentId ? { assignmentId } : { examId: itemId }}
            source="PLANNED"
            label="Start session"
            size="lg"
            variant="signal"
          />
          {assignmentId && (
            <Button onClick={complete} disabled={pending} size="lg" variant="outline">
              <Check className="h-4 w-4" />
              {pending ? "Saving…" : "Mark done"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
