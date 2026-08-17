import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { dateKey, explainScore, buildForecast } from "@/lib/planning";
import { DEFAULT_HORIZON_DAYS } from "@/lib/planning/constants";
import { formatDuration } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DayColumn } from "./day-column";
import { ForecastSection } from "./forecast-section";
import { WhatIfSimulator } from "./what-if-simulator";

export const metadata: Metadata = {
  title: "Your plan",
};

export default async function PlanPage() {
  const user = await requireUser();
  const now = new Date();

  const [plan, availability] = await Promise.all([
    generatePlanForUser(user.id, now),
    db.studyAvailability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
  ]);

  const scoredById = new Map(plan.scored.map((s) => [s.item.id, s]));

  const days = Array.from({ length: DEFAULT_HORIZON_DAYS }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(date);
    const dow = date.getDay();

    const sessions = plan.sessions
      .filter((s) => s.scheduledDate === key)
      .map((s) => {
        const scored = scoredById.get(s.item.id);
        return {
          title: s.item.title,
          className: s.item.className,
          classColor: s.item.classColor,
          minutes: s.scheduledMinutes,
          reasonCode: s.reasonCode,
          reasons: scored ? explainScore(scored, now, plan.scored) : [],
        };
      });

    const availableMinutes = availability
      .filter((w) => w.dayOfWeek === dow)
      .reduce((sum, w) => sum + Math.max(0, w.endMinute - w.startMinute), 0);

    return {
      date,
      label: i === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      isToday: i === 0,
      hasAvailability: availableMinutes > 0,
      sessions,
    };
  });

  const totalEstimatedMinutes = plan.scored.reduce((sum, s) => sum + s.item.remainingMinutes, 0);
  const totalAvailableMinutes = days.reduce((sum, d) => {
    const dow = d.date.getDay();
    return (
      sum +
      availability
        .filter((w) => w.dayOfWeek === dow)
        .reduce((s, w) => s + Math.max(0, w.endMinute - w.startMinute), 0)
    );
  }, 0);

  const overloaded = totalEstimatedMinutes > totalAvailableMinutes && totalAvailableMinutes > 0;
  const noAvailabilitySet = totalAvailableMinutes === 0;

  // totalAvailableMinutes already sums one full recurring week (the
  // horizon is exactly 7 days), so it doubles as "typical weekly available
  // time" for the forecast — no separate computation needed.
  const forecastWeeks = buildForecast(plan.scored, totalAvailableMinutes, now);
  const todayPlannedMinutes = days[0]?.sessions.reduce((sum, s) => sum + s.minutes, 0) ?? 0;

  // Items that didn't fit anywhere in the horizon — still real work the
  // student owes, so it needs to be visible somewhere on this page, not
  // just as an aggregate minute count. The dashboard already has a
  // fallback for "nothing scheduled today"; the weekly view needs its own,
  // since a day with no sessions here otherwise reads as "nothing to do."
  const unscheduledItems = Object.entries(plan.unscheduledMinutesByItem).map(
    ([itemId, minutes]) => {
      const scored = plan.scored.find((s) => s.item.id === itemId);
      return scored ? { ...scored.item, unscheduledMinutes: minutes } : null;
    },
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rushd balanced your workload around your deadlines and available time.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-semibold">{formatDuration(totalEstimatedMinutes)}</p>
              <p className="text-sm text-muted-foreground">Estimated academic work</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{formatDuration(totalAvailableMinutes)}</p>
              <p className="text-sm text-muted-foreground">Available time (7 days)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {noAvailabilitySet ? (
              <p className="text-sm text-muted-foreground">
                Set your study availability to see a status.
              </p>
            ) : (
              <p className={`text-sm font-medium ${overloaded ? "text-warning" : "text-success"}`}>
                {overloaded ? "Heavier than usual" : "On track"}
              </p>
            )}
            <Link href="/settings">
              <Button variant="outline" size="sm">
                Adjust availability
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {days.map((d) => (
          <DayColumn
            key={d.dateLabel + d.label}
            label={d.label}
            dateLabel={d.dateLabel}
            isToday={d.isToday}
            hasAvailability={d.hasAvailability}
            sessions={d.sessions}
          />
        ))}
      </div>

      {unscheduledItems.length > 0 && (
        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">Not yet scheduled</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {formatDuration(
              unscheduledItems.reduce((sum, i) => sum + i.unscheduledMinutes, 0),
            )}{" "}
            of work doesn&apos;t fit in your available time over the next{" "}
            {DEFAULT_HORIZON_DAYS} days. Still owed — just needs more study time. Add
            availability in{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Settings
            </Link>
            .
          </p>
          <div className="space-y-2">
            {unscheduledItems.map((item) => (
              <Link
                key={item.id}
                href={item.kind === "exam" ? "/exams" : "/assignments"}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.classColor }}
                  />
                  {item.title}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDuration(item.unscheduledMinutes)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <WhatIfSimulator
        todayMinutes={todayPlannedMinutes}
        thisWeekEstimated={forecastWeeks[0]?.estimatedMinutes ?? 0}
        thisWeekAvailable={forecastWeeks[0]?.availableMinutes ?? 0}
      />

      <ForecastSection weeks={forecastWeeks} />
    </div>
  );
}
