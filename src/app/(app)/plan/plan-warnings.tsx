import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { formatDuration, formatDueDate } from "@/lib/format";
import { formatDateKey } from "@/lib/time/zone";
import type { PlanWarning, ScoredItem } from "@/lib/planning/types";

type Shortfall = Extract<PlanWarning, { type: "DEADLINE_SHORTFALL" }>;
type Overloaded = Extract<PlanWarning, { type: "OVERLOADED_DAY" }>;
type OutsideTerm = Extract<PlanWarning, { type: "OUTSIDE_TERM" }>;

const OVERRIDE_NOTE: Record<NonNullable<Shortfall["override"]>, string> = {
  skip: "short because you skipped it today",
  not_this_week: "short because you moved it out of this week",
};

/** Work Rushd didn't plan because it falls outside its course's term dates. */
function OutsideTermNote({ items }: { items: OutsideTerm[] }) {
  if (items.length === 0) return null;
  return (
    <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
      Not planned, because it falls outside the course&apos;s term dates:{" "}
      {items.slice(0, 3).map((item, index) => (
        <span key={`${item.kind}:${item.itemId}`}>
          {index > 0 && ", "}
          <span className="font-medium text-foreground">{item.title}</span> ({item.className})
        </span>
      ))}
      {items.length > 3 && ` and ${items.length - 3} more`}. Check the term on the course page if that&apos;s wrong.
    </p>
  );
}

/** Says honestly what doesn't fit before its deadline, where the crunch lands,
 * and what to do first, instead of quietly over-filling days or dropping work. */
export function PlanWarnings({
  warnings,
  scored,
  timeZone,
  maxDailyMinutes,
}: {
  warnings: PlanWarning[];
  scored: ScoredItem[];
  timeZone: string;
  maxDailyMinutes: number;
}) {
  if (warnings.some((warning) => warning.type === "NO_AVAILABILITY")) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium">Rushd doesn&apos;t know when you can study yet.</p>
            <p className="text-sm text-muted-foreground">
              Your deadlines are tracked, but blocks can&apos;t be placed until you set study time.
            </p>
          </div>
        </div>
        <Link
          href="/settings#availability"
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Set study time
        </Link>
      </div>
    );
  }

  const outside = warnings.filter((warning): warning is OutsideTerm => warning.type === "OUTSIDE_TERM");
  const shortfalls = warnings.filter((warning): warning is Shortfall => warning.type === "DEADLINE_SHORTFALL");
  if (shortfalls.length === 0) return <OutsideTermNote items={outside} />;
  const days = warnings.filter((warning): warning is Overloaded => warning.type === "OVERLOADED_DAY");

  let totalShort = 0;
  for (const shortfall of shortfalls) {
    totalShort += shortfall.shortMinutes;
  }

  // Show the three short items the planner ranks highest.
  const rankById = new Map(scored.map((item, index) => [item.item.id, index]));
  const sortedShortfalls = [...shortfalls].sort((a, b) => (rankById.get(a.itemId) ?? 0) - (rankById.get(b.itemId) ?? 0));
  const firstUp = sortedShortfalls.slice(0, 3);

  return (
    <>
    <OutsideTermNote items={outside} />
    <section className="rounded-xl border border-warning/40 bg-warning/5 p-4 sm:p-5" aria-labelledby="overload-heading">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="overload-heading" className="font-semibold">
            {formatDuration(totalShort)} of work doesn&apos;t fit before its deadline
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rushd won&apos;t pretend it fits. Here&apos;s where the crunch is and what to do first.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground">Do these first</h3>
              <ol className="mt-2 space-y-1.5">
                {firstUp.map((shortfall) => (
                  <li key={shortfall.itemId} className="text-sm">
                    <span className="font-medium">{shortfall.title}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {shortfall.overdue ? "overdue" : `due ${formatDueDate(shortfall.dueAt, timeZone)}`} ·{" "}
                      {formatDuration(shortfall.shortMinutes)} {shortfall.override ? OVERRIDE_NOTE[shortfall.override] : "short"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {days.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground">Where it lands</h3>
                <ul className="mt-2 space-y-1.5">
                  {days.slice(0, 4).map((day) => (
                    <li key={day.date} className="text-sm">
                      <span className="font-medium">
                        {formatDateKey(day.date, { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <span className="text-muted-foreground"> · {formatDuration(day.shortMinutes)} over</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Options:{" "}
            <Link href="/settings#availability" className="font-medium text-foreground underline underline-offset-4">
              add study time
            </Link>
            ,{" "}
            <Link href="/settings#planning" className="font-medium text-foreground underline underline-offset-4">
              raise your daily limit
            </Link>{" "}
            (now {formatDuration(maxDailyMinutes)}), lower estimates that are too high, or ask a teacher about the
            lowest-priority item.
          </p>
        </div>
      </div>
    </section>
    </>
  );
}
