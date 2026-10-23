import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Clock, Flame, Gauge } from "lucide-react";
import { PathEmpty } from "@/components/brand/path-empty";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { buildInsights, type SessionRecord } from "@/lib/insights/build-insights";
import { logEvent } from "@/lib/analytics/log-event";
import { formatDuration } from "@/lib/format";
import { CourseRow, PageHeader, Panel, StatTile } from "@/components/page-section";
import { HelpfulWidget } from "@/components/helpful-widget";

export const metadata: Metadata = {
  title: "Progress",
};

// 0 -> "12 AM", 13 -> "1 PM"
function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

// Within 10% either way counts as "about as expected".
function accuracyColor(percentOff: number): string {
  if (Math.abs(percentOff) <= 10) return "text-success";
  if (percentOff > 0) return "text-warning";
  return "text-muted-foreground";
}

function accuracyText(percentOff: number): string {
  if (Math.abs(percentOff) <= 10) return "About as expected";
  if (percentOff > 0) return `Takes ${percentOff}% longer than estimated`;
  return `Takes ${Math.abs(percentOff)}% less time than estimated`;
}

export default async function InsightsPage() {
  const user = await requireUser();

  const [rows] = await Promise.all([
    db.studySession.findMany({
      where: { userId: user.id, status: { in: ["COMPLETED", "ABANDONED"] } },
      select: {
        className: true,
        classColor: true,
        status: true,
        plannedMinutes: true,
        actualMinutes: true,
        perceivedDifficulty: true,
        startedAt: true,
      },
      orderBy: { startedAt: "asc" },
    }),
    logEvent(user.id, "insights_viewed"),
  ]);

  const sessions: SessionRecord[] = rows.map((row) => ({
    className: row.className,
    classColor: row.classColor,
    status: row.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: row.plannedMinutes,
    actualMinutes: row.actualMinutes,
    perceivedDifficulty: row.perceivedDifficulty,
    startedAt: row.startedAt,
  }));

  const insights = buildInsights(sessions);
  const hasAnyPattern =
    insights.estimateAccuracy.length > 0 || insights.timeOfDay || insights.busiestDay;

  let completionText = "—";
  if (insights.overallCompletionRate !== null) {
    completionText = `${Math.round(insights.overallCompletionRate * 100)}%`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        description="What your study sessions show, computed from what you actually logged."
      >
        <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
          <Link href="/profile" className="underline underline-offset-4">
            Academic profile
          </Link>
          <Link href="/how-rushd-thinks" className="underline underline-offset-4">
            How Rushd plans
          </Link>
        </p>
      </PageHeader>

      {insights.totalSessions === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-5 sm:px-8">
          <PathEmpty title="No study sessions yet">
            Start and finish a few study sessions and Rushd will start noticing patterns: how accurate your estimates are and
            when you actually get things done.
          </PathEmpty>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile value={insights.totalSessions} label="Study sessions logged" />
            <StatTile value={formatDuration(insights.totalFocusedMinutes)} label="Total focused time" />
            <StatTile className="col-span-2 sm:col-span-1" value={completionText} label="Sessions completed, not abandoned" />
          </div>

          {!hasAnyPattern && (
            <p className="text-sm text-muted-foreground">
              Keep going — Rushd needs a few more sessions per course and time of day before it
              can point out real patterns instead of noise.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {insights.estimateAccuracy.length > 0 && (
              <Panel
                id="accuracy"
                icon={Gauge}
                title="Estimate accuracy"
                description="How your actual study time compares to what Rushd estimated, by course."
              >
                <ul className="divide-y divide-border">
                  {insights.estimateAccuracy.map((row) => (
                    <CourseRow key={row.className} color={row.classColor}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.className}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.sessionCount} session{row.sessionCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className={`shrink-0 text-right text-sm font-medium ${accuracyColor(row.percentOff)}`}>
                        {accuracyText(row.percentOff)}
                      </span>
                    </CourseRow>
                  ))}
                </ul>
              </Panel>
            )}

            {insights.difficulty.length > 0 && (
              <Panel
                id="difficulty"
                icon={Activity}
                title="How work feels, by course"
                description="Based on how you rated sessions right after finishing them."
              >
                <ul className="divide-y divide-border">
                  {insights.difficulty.map((row) => (
                    <CourseRow key={row.className} color={row.classColor}>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.className}</span>
                      <span className="shrink-0 text-right text-sm text-muted-foreground">
                        Felt harder than expected {Math.round(row.harderShare * 100)}% of the time
                      </span>
                    </CourseRow>
                  ))}
                </ul>
              </Panel>
            )}

            {insights.timeOfDay && (
              <Panel
                id="time-of-day"
                icon={Clock}
                title="When you actually finish things"
                description={`Completion rate for sessions started before vs. after ${formatHour(insights.timeOfDay.cutoffHour)}.`}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-2 px-3 py-3">
                    <p className="font-display text-2xl font-medium tabular-nums">{Math.round(insights.timeOfDay.beforeRate * 100)}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Before {formatHour(insights.timeOfDay.cutoffHour)} ({insights.timeOfDay.beforeCount}{" "}
                      session{insights.timeOfDay.beforeCount === 1 ? "" : "s"})
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-2 px-3 py-3">
                    <p className="font-display text-2xl font-medium tabular-nums">{Math.round(insights.timeOfDay.afterRate * 100)}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      After {formatHour(insights.timeOfDay.cutoffHour)} ({insights.timeOfDay.afterCount}{" "}
                      session{insights.timeOfDay.afterCount === 1 ? "" : "s"})
                    </p>
                  </div>
                </div>
              </Panel>
            )}

            {insights.busiestDay && (
              <Panel id="busiest-day" icon={Flame} title="Your busiest day">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{insights.busiestDay.dayLabel}</span> is
                  when you study most — {insights.busiestDay.sessionCount} of your last{" "}
                  {insights.totalSessions} sessions ({Math.round(insights.busiestDay.shareOfWeek * 100)}%)
                  started that day. Worth building in extra buffer around it.
                </p>
              </Panel>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Link
              href="/how-rushd-thinks"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Curious how this is calculated? See how Rushd thinks →
            </Link>
            <HelpfulWidget feature="insights" />
          </div>
        </>
      )}
    </div>
  );
}
