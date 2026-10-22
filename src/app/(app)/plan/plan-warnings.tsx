import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { formatDuration, formatDueDate } from "@/lib/format";
import { formatDateKey } from "@/lib/time/zone";
import type { PlanWarning, ScoredItem } from "@/lib/planning/types";

type Shortfall = Extract<PlanWarning, { type: "DEADLINE_SHORTFALL" }>;
type Overloaded = Extract<PlanWarning, { type: "OVERLOADED_DAY" }>;

/**
 * Honest overload reporting: what doesn't fit before its deadline, by how
 * much, which day the crunch lands on, and what to do first — instead of
 * quietly over-filling days or dropping work.
 */
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
  if (warnings.some((w) => w.type === "NO_AVAILABILITY")) {
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

  const shortfalls = warnings.filter((w): w is Shortfall => w.type === "DEADLINE_SHORTFALL");
  if (shortfalls.length === 0) return null;
  const days = warnings.filter((w): w is Overloaded => w.type === "OVERLOADED_DAY");
  const totalShort = shortfalls.reduce((n, s) => n + s.shortMinutes, 0);
  const rank = new Map(scored.map((s, i) => [s.item.id, i]));
  const firstUp = [...shortfalls].sort((a, b) => (rank.get(a.itemId) ?? 0) - (rank.get(b.itemId) ?? 0)).slice(0, 3);

  return (
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
                {firstUp.map((s) => (
                  <li key={s.itemId} className="text-sm">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {s.overdue ? "overdue" : `due ${formatDueDate(s.dueAt, timeZone)}`} ·{" "}
                      {formatDuration(s.shortMinutes)} short
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {days.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground">Where it lands</h3>
                <ul className="mt-2 space-y-1.5">
                  {days.slice(0, 4).map((d) => (
                    <li key={d.date} className="text-sm">
                      <span className="font-medium">
                        {formatDateKey(d.date, { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <span className="text-muted-foreground"> · {formatDuration(d.shortMinutes)} over</span>
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
  );
}
