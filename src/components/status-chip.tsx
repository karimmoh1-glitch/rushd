import { cn } from "@/lib/utils";
import type { DueStatus } from "@/lib/format";

const LABELS: Record<DueStatus, string> = {
  overdue: "Overdue",
  today: "Today",
  soon: "Soon",
  later: "Upcoming",
};

const STYLES: Record<DueStatus, string> = {
  overdue: "bg-overdue/12 text-overdue ring-overdue/25",
  today: "bg-signal/14 text-signal-ink ring-signal/30",
  soon: "bg-soon/12 text-soon ring-soon/25",
  later: "bg-muted text-muted-foreground ring-border",
};

/** A small colored label for how urgent a deadline is. The words carry the meaning; color only reinforces it. */
export function StatusChip({ status, className }: { status: DueStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium leading-none ring-1 ring-inset",
        STYLES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
