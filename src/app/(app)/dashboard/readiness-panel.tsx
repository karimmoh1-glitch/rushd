import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDuration, formatDueDate } from "@/lib/format";
import type { Readiness, ReadinessLevel } from "@/lib/planning/outcomes";
import { Panel } from "./panel";

const CHIP: Record<ReadinessLevel, string> = {
  at_risk: "bg-overdue/12 text-overdue ring-1 ring-inset ring-overdue/25",
  getting_there: "bg-soon/12 text-soon ring-1 ring-inset ring-soon/25",
  on_track: "bg-done/12 text-done ring-1 ring-inset ring-done/25",
  not_enough_evidence: "border border-dashed border-border-strong text-muted-foreground",
  no_topics: "border border-dashed border-border-strong text-muted-foreground",
};

export interface NextAssessment {
  examId: string;
  classId: string;
  title: string;
  className: string;
  classColor: string;
  examAt: Date;
  daysLeft: number;
  plannedPrepMinutes: number;
  neededPrepMinutes: number;
  readiness: Readiness;
}

function daysLeftLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "Am I ready for my next assessment?": a labeled estimate from topic
 * coverage, mastery statuses and planned prep, with what would raise
 * confidence. "Not enough evidence" is a real answer. */
export function ReadinessPanel({ next, tz, now }: { next: NextAssessment; tz: string; now: Date }) {
  const { readiness } = next;
  const counts = readiness.counts;
  return (
    <Panel
      id="readiness-heading"
      title="Next assessment"
      aside={<span className="text-sm tabular-nums text-muted-foreground">{formatDueDate(next.examAt, tz, now)}</span>}
    >
      <div className="space-y-3 pb-1 pt-2" style={{ ["--course" as string]: next.classColor }}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="course-rule mt-0.5 h-9 w-1 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{next.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {next.className} · {daysLeftLabel(next.daysLeft)}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium leading-none whitespace-nowrap",
              CHIP[readiness.level],
            )}
          >
            {readiness.label}
          </span>
        </div>

        <p className="text-sm">
          <span className="text-muted-foreground">
            Estimate{readiness.confidence ? ` · ${readiness.confidence} confidence` : ""}:{" "}
          </span>
          {readiness.summary}
        </p>

        {counts.total > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <dt className="text-muted-foreground">Topics practiced</dt>
              <dd className="tabular-nums">
                {readiness.practiced} of {counts.total}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <dt className="text-muted-foreground">Prep planned</dt>
              <dd className="tabular-nums">
                {formatDuration(next.plannedPrepMinutes)} of {formatDuration(next.neededPrepMinutes)}
              </dd>
            </div>
          </dl>
        )}

        {readiness.improve.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {readiness.level === "not_enough_evidence" || readiness.level === "no_topics" ? "To find out" : "What would help"}
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {readiness.improve.slice(0, 3).map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden="true" className="course-rule mt-[0.5rem] h-1 w-1 shrink-0 rounded-full" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          From your own practice answers, not a prediction of your grade.{" "}
          <Link href={`/courses/${next.classId}/topics`} className="font-medium text-foreground underline underline-offset-4">
            {counts.total === 0 ? "Add topics" : "See topics"}
          </Link>
        </p>
      </div>
    </Panel>
  );
}
