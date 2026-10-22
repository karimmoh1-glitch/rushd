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
    <section aria-labelledby="next-up" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-up" className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
          Next up
        </h2>
        <PulseBadge pulse={pulse} showLabel />
      </div>
      <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: classColor }} />
            <span className="truncate font-display text-2xl font-medium tracking-tight sm:text-[1.75rem]">{title}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {className} · {formatDuration(minutes)} left
            {when ? ` · ${when}` : ""}
          </p>
          {reasons.length > 0 && (
            <ul className="mt-3 max-w-prose space-y-1 text-sm text-foreground/80">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StartSessionButton
            target={assignmentId ? { assignmentId } : { examId: itemId }}
            source="PLANNED"
            label="Start session"
            variant="default"
          />
          {assignmentId && (
            <Button onClick={complete} disabled={pending} size="sm" variant="outline">
              <Check className="h-4 w-4" />
              {pending ? "Saving…" : "Mark done"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
