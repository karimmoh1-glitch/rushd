"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setAssignmentStatus } from "@/server/actions/assignments";
import { logPlanItemInteraction } from "@/server/actions/plan-item-events";
import { StartSessionButton } from "@/components/start-session-button";
import { HelpfulWidget } from "@/components/helpful-widget";
import { formatDuration } from "@/lib/format";

export function OneThing({
  itemId,
  itemKind,
  assignmentId,
  title,
  className,
  classColor,
  minutes,
  reasons,
}: {
  itemId: string;
  itemKind: "assignment" | "exam";
  assignmentId: string | null;
  title: string;
  className: string;
  classColor: string;
  minutes: number;
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
      toast.success("Nice work.");
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-accent/60 via-accent/25 to-transparent shadow-[0_0_60px_-20px_var(--color-primary)]">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            One thing
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: classColor }}
            />
            <h2 className="truncate font-heading text-2xl font-semibold tracking-tight">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {className} · {formatDuration(minutes)}
          </p>
          {reasons.length > 0 && (
            <div className="mt-3 max-w-md">
              <p className="text-xs font-medium text-muted-foreground">Do this now because:</p>
              <ul className="mt-1.5 space-y-1">
                {reasons.map((reason) => (
                  <li key={reason} className="text-sm text-foreground/80">
                    — {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <HelpfulWidget feature="one_thing" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StartSessionButton
            target={assignmentId ? { assignmentId } : { examId: itemId }}
            source="PLANNED"
            size="lg"
          />
          {assignmentId && (
            <Button onClick={complete} disabled={pending} size="lg" variant="outline">
              <CheckCircle2 className="h-4 w-4" />
              {pending ? "Marking done…" : "Mark complete"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
