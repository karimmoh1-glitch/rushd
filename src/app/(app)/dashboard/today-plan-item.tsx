"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setAssignmentStatus } from "@/server/actions/assignments";
import { logPlanItemInteraction } from "@/server/actions/plan-item-events";
import { StartSessionButton } from "@/components/start-session-button";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One timed block in today's plan. */
export function TodayPlanItem({
  itemId,
  itemKind,
  assignmentId,
  title,
  className,
  classColor,
  scheduledMinutes,
  reasons,
  timeLabel,
}: {
  itemId: string;
  itemKind: "assignment" | "exam";
  assignmentId: string | null;
  title: string;
  className: string;
  classColor: string;
  scheduledMinutes: number;
  reasons: string[];
  /** e.g. "4:00 PM", when the block has a planned start time. */
  timeLabel?: string;
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
    });
  }

  function skip() {
    startTransition(async () => {
      await logPlanItemInteraction("skipped", itemId, itemKind);
      toast.info("Skipped for today.");
    });
  }

  return (
    <li className={cn("flex items-center gap-3 py-3 transition-opacity duration-200", pending && "opacity-50")}>
      {timeLabel && (
        <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{timeLabel}</span>
      )}
      <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: classColor }} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", pending && "line-through decoration-muted-foreground")}>{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {className} · {formatDuration(scheduledMinutes)}
          {reasons.length > 0 && (
            <>
              {" · "}
              <Popover>
                <PopoverTrigger
                  render={
                    <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                      Why now?
                    </button>
                  }
                />
                <PopoverContent className="w-72" align="start">
                  <ul className="space-y-1 text-sm">
                    {reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <StartSessionButton
          target={assignmentId ? { assignmentId } : { examId: itemId }}
          source="PLANNED"
          variant="ghost"
        />
        {assignmentId && (
          <span className="flex h-8 w-8 items-center justify-center">
            <Checkbox
              onCheckedChange={(checked) => checked === true && complete()}
              disabled={pending}
              aria-label={`Mark "${title}" done`}
            />
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={pending}
          onClick={skip}
          aria-label={`Skip "${title}" today`}
          title="Not today"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
