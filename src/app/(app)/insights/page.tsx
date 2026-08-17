import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Clock, Flame, Gauge } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { buildInsights, type SessionRecord } from "@/lib/insights/build-insights";
import { logEvent } from "@/lib/analytics/log-event";
import { formatDuration } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";
import { HelpfulWidget } from "@/components/helpful-widget";

export const metadata: Metadata = {
  title: "Insights",
};

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
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

  const sessions: SessionRecord[] = rows.map((r) => ({
    className: r.className,
    classColor: r.classColor,
    status: r.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: r.plannedMinutes,
    actualMinutes: r.actualMinutes,
    perceivedDifficulty: r.perceivedDifficulty,
    startedAt: r.startedAt,
  }));

  const insights = buildInsights(sessions);
  const hasAnyPattern =
    insights.estimateAccuracy.length > 0 || insights.timeOfDay || insights.busiestDay;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Insights</h1>
        <p className="mt-1 text-base text-muted-foreground">
          What your own study history says — computed from real sessions, not guesses.
        </p>
      </div>

      {insights.totalSessions === 0 ? (
        <Reveal>
          <div className="rounded-lg border border-dashed border-border py-14 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-muted-foreground">
              Start and finish a few study sessions and Rushd will start noticing patterns —
              how accurate your estimates are, when you actually get things done.
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="py-4">
                  <p className="text-2xl font-semibold">{insights.totalSessions}</p>
                  <p className="text-sm text-muted-foreground">Study sessions logged</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-2xl font-semibold">
                    {formatDuration(insights.totalFocusedMinutes)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total focused time</p>
                </CardContent>
              </Card>
              <Card className="col-span-2 sm:col-span-1">
                <CardContent className="py-4">
                  <p className="text-2xl font-semibold">
                    {insights.overallCompletionRate !== null
                      ? `${Math.round(insights.overallCompletionRate * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">Sessions completed, not abandoned</p>
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {!hasAnyPattern && (
            <Reveal delay={0.06}>
              <p className="text-sm text-muted-foreground">
                Keep going — Rushd needs a few more sessions per class and time of day before it
                can point out real patterns instead of noise.
              </p>
            </Reveal>
          )}

          {insights.estimateAccuracy.length > 0 && (
            <Reveal delay={0.06}>
              <section>
                <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
                  Estimate accuracy
                </h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  How your actual study time compares to what Rushd estimated, by class.
                </p>
                <div className="space-y-2">
                  {insights.estimateAccuracy.map((row) => (
                    <div
                      key={row.className}
                      className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.classColor }}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.className}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.sessionCount} session{row.sessionCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-medium ${
                          Math.abs(row.percentOff) <= 10
                            ? "text-success"
                            : row.percentOff > 0
                              ? "text-warning"
                              : "text-muted-foreground"
                        }`}
                      >
                        {Math.abs(row.percentOff) <= 10
                          ? "About as expected"
                          : row.percentOff > 0
                            ? `Takes ${row.percentOff}% longer than estimated`
                            : `Takes ${Math.abs(row.percentOff)}% less time than estimated`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {insights.timeOfDay && (
            <Reveal delay={0.12}>
              <section>
                <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold">
                  <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                  When you actually finish things
                </h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  Completion rate for sessions started before vs. after {formatHour(insights.timeOfDay.cutoffHour)}.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-2xl font-semibold">
                        {Math.round(insights.timeOfDay.beforeRate * 100)}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Before {formatHour(insights.timeOfDay.cutoffHour)} ({insights.timeOfDay.beforeCount}{" "}
                        session{insights.timeOfDay.beforeCount === 1 ? "" : "s"})
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-2xl font-semibold">
                        {Math.round(insights.timeOfDay.afterRate * 100)}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        After {formatHour(insights.timeOfDay.cutoffHour)} ({insights.timeOfDay.afterCount}{" "}
                        session{insights.timeOfDay.afterCount === 1 ? "" : "s"})
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </Reveal>
          )}

          {insights.busiestDay && (
            <Reveal delay={0.18}>
              <section>
                <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold">
                  <Flame className="h-4 w-4 text-primary" aria-hidden="true" />
                  Your busiest day
                </h2>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{insights.busiestDay.dayLabel}</span> is
                  when you study most — {insights.busiestDay.sessionCount} of your last{" "}
                  {insights.totalSessions} sessions ({Math.round(insights.busiestDay.shareOfWeek * 100)}%)
                  started that day. Worth building in extra buffer around it.
                </p>
              </section>
            </Reveal>
          )}

          {insights.difficulty.length > 0 && (
            <Reveal delay={0.24}>
              <section>
                <h2 className="mb-1 font-heading text-lg font-semibold">How work feels, by class</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  Based on how you rated sessions right after finishing them.
                </p>
                <div className="space-y-2">
                  {insights.difficulty.map((row) => (
                    <div
                      key={row.className}
                      className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.classColor }}
                        />
                        <p className="truncate font-medium">{row.className}</p>
                      </div>
                      <p className="shrink-0 text-sm text-muted-foreground">
                        Felt harder than expected {Math.round(row.harderShare * 100)}% of the time
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          <Reveal delay={0.3}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/how-rushd-thinks"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Curious how this is calculated? See how Rushd thinks →
              </Link>
              <HelpfulWidget feature="insights" />
            </div>
          </Reveal>
        </>
      )}
    </div>
  );
}
