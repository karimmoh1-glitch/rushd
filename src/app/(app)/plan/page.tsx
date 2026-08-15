import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { dateKey } from "@/lib/planning";
import { DEFAULT_HORIZON_DAYS } from "@/lib/planning/constants";
import { formatDuration } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DayColumn } from "./day-column";

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

  const days = Array.from({ length: DEFAULT_HORIZON_DAYS }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(date);
    const dow = date.getDay();

    const sessions = plan.sessions
      .filter((s) => s.scheduledDate === key)
      .map((s) => ({
        title: s.item.title,
        className: s.item.className,
        classColor: s.item.classColor,
        minutes: s.scheduledMinutes,
        reasonCode: s.reasonCode,
      }));

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

      {Object.keys(plan.unscheduledMinutesByItem).length > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatDuration(
            Object.values(plan.unscheduledMinutesByItem).reduce((a, b) => a + b, 0),
          )}{" "}
          of work doesn&apos;t fit in your available time over the next {DEFAULT_HORIZON_DAYS} days.
          Consider adding more study availability in{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      )}
    </div>
  );
}
