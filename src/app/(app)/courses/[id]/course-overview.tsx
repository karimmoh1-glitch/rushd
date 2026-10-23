import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { dueStatus, formatDueDate, formatDuration } from "@/lib/format";

export interface CourseWorkRow {
  key: string;
  href: string;
  title: string;
  at: Date;
  kind: "assignment" | "exam";
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-card px-4 py-3.5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

/** At-a-glance numbers for one course, all from the student's own data. */
export function CourseStats({
  next,
  openCount,
  studiedMinutes,
  goalMinutes,
  tz,
  now,
}: {
  next: CourseWorkRow | undefined;
  openCount: number;
  studiedMinutes: number;
  goalMinutes: number | null;
  tz: string;
  now: Date;
}) {
  const percent = goalMinutes ? Math.min(100, Math.round((studiedMinutes / goalMinutes) * 100)) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Next due">
        {next ? (
          <Link href={next.href} className="block truncate font-medium underline-offset-4 hover:underline">
            {next.title}
            <span className="block truncate text-xs font-normal text-muted-foreground">{formatDueDate(next.at, tz, now)}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground">Nothing due</span>
        )}
      </Stat>
      <Stat label="Open work">
        <span className="font-display text-2xl font-medium tabular-nums">{openCount}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">
          {openCount === 1 ? "item" : "items"}
        </span>
      </Stat>
      <Stat label="Studied, last 7 days">
        <span className="font-display text-2xl font-medium tabular-nums">{formatDuration(studiedMinutes)}</span>
        {goalMinutes ? (
          <span className="ml-1.5 text-xs text-muted-foreground">of {formatDuration(goalMinutes)} goal</span>
        ) : null}
        {percent !== null && (
          <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="course-rule block h-full rounded-full" style={{ width: `${percent}%` }} />
          </span>
        )}
      </Stat>
    </div>
  );
}

/** This course's open assignments and upcoming exams, soonest first. */
export function CourseWork({ rows, tz, now }: { rows: CourseWorkRow[]; tz: string; now: Date }) {
  return (
    <section aria-labelledby="course-work-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 id="course-work-heading" className="text-base font-semibold">
          Coming up in this course
        </h2>
        <Link href="/assignments" className="text-sm text-muted-foreground hover:text-foreground">
          All assignments
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No open assignments or upcoming exams for this course.</p>
      ) : (
        <ul className="-mx-2 pt-1">
          {rows.map((row) => {
            const status = dueStatus(row.at, tz, now);
            return (
              <li key={row.key}>
                <Link href={row.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-muted/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.title}</span>
                    <span className="block text-xs text-muted-foreground">{row.kind === "exam" ? "Exam" : "Assignment"}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap">
                    <StatusChip status={status} />
                    <span className={status === "overdue" ? "text-xs tabular-nums text-overdue" : "text-xs tabular-nums text-muted-foreground"}>
                      {formatDueDate(row.at, tz, now)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
