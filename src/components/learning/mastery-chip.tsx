import { cn } from "@/lib/utils";
import { STATUS_LABEL, type MasteryStatusV2 } from "@/lib/learning/estimator";

const STYLES: Record<MasteryStatusV2, string> = {
  secure: "bg-done/12 text-done ring-1 ring-inset ring-done/25",
  developing: "bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/15",
  needs_review: "bg-signal/14 text-signal-ink ring-1 ring-inset ring-signal/35",
  not_enough_evidence: "border border-dashed border-border-strong text-muted-foreground",
};

const DOTS: Record<MasteryStatusV2, string> = {
  secure: "bg-done",
  developing: "bg-foreground/45",
  needs_review: "bg-signal",
  not_enough_evidence: "border border-dashed border-muted-foreground bg-transparent",
};

/** A topic's mastery status. The words carry the meaning; color only reinforces it. */
export function MasteryChip({ status, className }: { status: MasteryStatusV2; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium leading-none whitespace-nowrap",
        STYLES[status],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", DOTS[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** "About 62–88% · medium confidence · 6 answers"; no range at all while there's too little evidence. Null with no answers. */
export function estimateLine(e: {
  status: MasteryStatusV2;
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: string;
  answers: number;
}): string | null {
  if (e.answers === 0 || e.estimate === null || e.low === null || e.high === null) return null;
  const answers = `${e.answers} answer${e.answers === 1 ? "" : "s"}`;
  if (e.status === "not_enough_evidence") return `${answers} so far · too few for an estimate`;
  return `About ${e.low}–${e.high}% · ${e.confidence} confidence · ${answers}`;
}
