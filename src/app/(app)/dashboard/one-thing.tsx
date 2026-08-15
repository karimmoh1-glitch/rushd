"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setAssignmentStatus } from "@/server/actions/assignments";
import { logPlanItemInteraction } from "@/server/actions/plan-item-events";
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
    <div className="overflow-hidden rounded-xl border-2 border-primary bg-accent/40">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            One thing
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: classColor }}
            />
            <h2 className="truncate font-heading text-xl font-semibold">{title}</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {className} · {formatDuration(minutes)}
          </p>
          <ul className="mt-3 space-y-1">
            {reasons.map((reason) => (
              <li key={reason} className="text-sm text-muted-foreground">
                — {reason}
              </li>
            ))}
          </ul>
        </div>

        {assignmentId ? (
          <Button onClick={complete} disabled={pending} size="lg" className="shrink-0">
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "Marking done…" : "Mark complete"}
          </Button>
        ) : (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            Study session
          </span>
        )}
      </div>
    </div>
  );
}
