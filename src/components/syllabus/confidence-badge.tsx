import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/syllabus/types";

const LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

const STYLE: Record<Confidence, string> = {
  high: "bg-done/12 text-done ring-done/25",
  medium: "bg-muted text-muted-foreground ring-border",
  low: "bg-soon/15 text-foreground ring-soon/45",
};

/** How sure Rushd is about one extracted item. The words carry the meaning; color only reinforces it. */
export function ConfidenceBadge({ confidence, className }: { confidence: Confidence; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium leading-none ring-1 ring-inset",
        STYLE[confidence],
        className,
      )}
    >
      {LABEL[confidence]}
      <span className="sr-only"> confidence</span>
    </span>
  );
}
