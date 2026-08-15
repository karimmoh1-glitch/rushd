"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setAssignmentStatus } from "@/server/actions/assignments";
import { logPlanItemInteraction } from "@/server/actions/plan-item-events";
import { formatDuration } from "@/lib/format";
import { REASON_LABELS } from "@/lib/planning/constants";
import type { ReasonCode } from "@/lib/planning/types";

export function TodayPlanItem({
  itemId,
  itemKind,
  assignmentId,
  title,
  className,
  classColor,
  scheduledMinutes,
  reasonCode,
  reasons,
}: {
  itemId: string;
  itemKind: "assignment" | "exam";
  assignmentId: string | null;
  title: string;
  className: string;
  classColor: string;
  scheduledMinutes: number;
  reasonCode: ReasonCode;
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
    });
  }

  function skip() {
    startTransition(async () => {
      await logPlanItemInteraction("skipped", itemId, itemKind);
      toast.info("Noted — this helps Rushd learn what's actually a priority.");
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
      {assignmentId ? (
        <Checkbox
          onCheckedChange={(v) => v === true && complete()}
          disabled={pending}
          aria-label="Mark completed"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 rounded-full border-2"
          style={{ borderColor: classColor }}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: classColor }}
          />
          {className} · {formatDuration(scheduledMinutes)}
        </p>
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="hidden shrink-0 sm:inline-flex"
              aria-label={`Why: ${REASON_LABELS[reasonCode]}`}
            >
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                {REASON_LABELS[reasonCode]}
              </Badge>
            </button>
          }
        />
        <PopoverContent className="w-64" align="end">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Why this?
          </p>
          <ul className="space-y-1">
            {reasons.map((reason) => (
              <li key={reason} className="text-sm">
                {reason}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        disabled={pending}
        onClick={skip}
        aria-label={`Not doing "${title}" today`}
        title="Not today"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
