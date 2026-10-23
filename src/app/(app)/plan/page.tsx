import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { explainScore, buildForecast } from "@/lib/planning";
import type { ScheduledSession, ScoredItem } from "@/lib/planning/types";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_HORIZON_DAYS,
  LEAD_WINDOW_DAYS,
  PLANNING_HORIZON_DAYS,
} from "@/lib/planning/constants";
import { formatDuration, formatDueDate } from "@/lib/format";
import { addDaysToKey, formatDateKey, localDateKey } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { ForecastSection } from "./forecast-section";
import { WhatIfSimulator } from "./what-if-simulator";
import { ScheduleAgenda } from "./schedule-agenda";
import { PlanWarnings } from "./plan-warnings";
import { ClearPinnedButton } from "./clear-pinned-button";
import type { AgendaBlock, AgendaDay, DayOption } from "./types";

export const metadata: Metadata = {
  title: "Schedule",
};

/** "Today", "Tomorrow", or the weekday name, by how many days from today. */
function relativeDayName(daysFromToday: number, dateKey: string): string {
  if (daysFromToday === 0) return "Today";
  if (daysFromToday === 1) return "Tomorrow";
  return formatDateKey(dateKey, { weekday: "long" });
}

function dueLabelFor(dueAt: Date, now: Date, tz: string): string {
  if (dueAt.getTime() < now.getTime()) {
    return `overdue since ${formatDateKey(localDateKey(dueAt, tz), { month: "short", day: "numeric" })}`;
  }
  return `due ${formatDueDate(dueAt, tz, now)}`;
}

function sum(numbers: number[]): number {
  let total = 0;
  for (const value of numbers) {
    total += value;
  }
  return total;
}

/** One scheduled session in the shape the agenda shows. */
function toAgendaBlock(
  session: ScheduledSession,
  index: number,
  scored: ScoredItem | undefined,
  allScored: ScoredItem[],
  now: Date,
  tz: string,
): AgendaBlock {
  const startMinute = session.startMinute ?? 0;
  return {
    key: session.blockId ?? `${session.item.id}-${session.scheduledDate}-${session.startMinute}-${index}`,
    kind: session.item.kind,
    itemId: session.item.id,
    title: session.item.title,
    className: session.item.className,
    classColor: session.item.classColor,
    date: session.scheduledDate,
    startMinute,
    endMinute: session.endMinute ?? startMinute + session.scheduledMinutes,
    minutes: session.scheduledMinutes,
    pinned: Boolean(session.pinned),
    blockId: session.blockId,
    reasonCode: session.reasonCode,
    reasons: scored ? explainScore(scored, now, allScored, tz) : [],
    fromCanvas: session.item.source === "CANVAS",
    dueLabel: dueLabelFor(session.item.dueAt, now, tz),
  };
}

function NothingToPlan() {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-medium">Nothing to plan yet.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Connect Canvas or add an assignment and Rushd will place it in your week.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/integrations/canvas" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Connect Canvas
        </Link>
        <Link href="/assignments" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          Add manually
        </Link>
      </div>
    </div>
  );
}

export default async function PlanPage() {
  const user = await requireUser();
  const now = new Date();

  const [plan, profile, availability, canvas] = await Promise.all([
    generatePlanForUser(user.id, now),
    db.profile.findUnique({
      where: { userId: user.id },
      select: { preferredSessionMinutes: true, maxDailyMinutes: true },
    }),
    db.studyAvailability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    db.canvasConnection.findUnique({ where: { userId: user.id }, select: { lastSyncAt: true } }),
  ]);

  const tz = plan.timeZone;
  const todayKey = localDateKey(now, tz);
  const scoredById = new Map(plan.scored.map((scored) => [scored.item.id, scored]));

  // The agenda: each day in the horizon with its scheduled blocks.
  const planDays = (plan.days ?? []).slice(0, DEFAULT_HORIZON_DAYS);
  const days: AgendaDay[] = planDays.map((day, dayIndex) => {
    const sessionsThatDay = plan.sessions.filter((session) => session.scheduledDate === day.date);
    return {
      date: day.date,
      label: relativeDayName(dayIndex, day.date),
      dateLabel: formatDateKey(day.date, { month: "short", day: "numeric" }),
      isToday: day.date === todayKey,
      availableMinutes: day.availableMinutes,
      plannedMinutes: day.plannedMinutes,
      status: day.status,
      blocks: sessionsThatDay.map((session, index) =>
        toAgendaBlock(session, index, scoredById.get(session.item.id), plan.scored, now, tz),
      ),
    };
  });

  // Days a block can be moved to, like "Tomorrow, Oct 23".
  const dayOptions: DayOption[] = [];
  for (let i = 0; i < PLANNING_HORIZON_DAYS; i++) {
    const key = addDaysToKey(todayKey, i);
    dayOptions.push({
      date: key,
      label: `${relativeDayName(i, key)}, ${formatDateKey(key, { month: "short", day: "numeric" })}`,
    });
  }

  const weekPlanned = sum(days.map((day) => day.plannedMinutes));
  const weekAvailable = sum(days.map((day) => day.availableMinutes));
  const openWork = sum(plan.scored.map((scored) => scored.item.remainingMinutes));
  const pinnedCount = plan.sessions.filter((session) => session.pinned).length;
  const deferredCount = Object.keys(plan.deferredMinutesByItem ?? {}).length;

  const weeklyAvailable = sum(availability.map((window) => Math.max(0, window.endMinute - window.startMinute)));
  const forecastWeeks = buildForecast(plan.scored, weeklyAvailable, now, tz);
  const todayPlannedMinutes = days[0]?.plannedMinutes ?? 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every block is placed inside your study time and before its deadline.
            {canvas?.lastSyncAt && <> Canvas last synced {formatDueDate(canvas.lastSyncAt, tz, now)}.</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pinnedCount > 0 && <ClearPinnedButton count={pinnedCount} />}
          <Link
            href="/settings#planning"
            className={buttonVariants({ variant: "outline" })}
          >
            Planning settings
          </Link>
        </div>
      </header>

      <PlanWarnings
        warnings={plan.warnings ?? []}
        scored={plan.scored}
        timeZone={tz}
        maxDailyMinutes={profile?.maxDailyMinutes ?? 240}
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-5 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Planned this week</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{formatDuration(weekPlanned)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Study time available</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{formatDuration(weekAvailable)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Open work, all deadlines</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{formatDuration(openWork)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Blocks you locked</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{pinnedCount}</dd>
        </div>
      </dl>

      {plan.scored.length === 0 ? <NothingToPlan /> : <ScheduleAgenda days={days} dayOptions={dayOptions} />}

      {deferredCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {deferredCount} assignment{deferredCount === 1 ? " is" : "s are"} due more than {LEAD_WINDOW_DAYS} days out.
          Rushd will start placing {deferredCount === 1 ? "it" : "them"} as the deadline gets closer, so this week stays
          focused.
        </p>
      )}

      <WhatIfSimulator
        todayMinutes={todayPlannedMinutes}
        thisWeekEstimated={forecastWeeks[0]?.estimatedMinutes ?? 0}
        thisWeekAvailable={forecastWeeks[0]?.availableMinutes ?? 0}
      />

      <ForecastSection weeks={forecastWeeks} />

      <details className="group rounded-xl border border-border p-5 text-sm">
        <summary className="cursor-pointer list-none font-medium marker:hidden">
          How Rushd built this plan
          <span className="ml-2 text-muted-foreground group-open:hidden">Show</span>
        </summary>
        <ul className="mt-4 space-y-2 text-muted-foreground">
          <li>Work is ranked by how soon it&apos;s due, priority, overdue status, and exam proximity. The top item gets the earliest open time.</li>
          <li>
            Blocks are about {formatDuration(profile?.preferredSessionMinutes ?? 60)} with a {DEFAULT_BREAK_MINUTES}-minute
            break between them, and no day gets more than {formatDuration(profile?.maxDailyMinutes ?? 240)}.
          </li>
          <li>Big tasks are spread one block per day; extra blocks are added only when a deadline needs them.</li>
          <li>Nothing is placed after its due time. Work due more than {LEAD_WINDOW_DAYS} days out waits until it&apos;s closer.</li>
          <li>Blocks you lock or move stay exactly where you put them. Everything else is recalculated whenever your work changes.</li>
        </ul>
        <Link href="/how-rushd-thinks" className="mt-3 inline-block font-medium underline underline-offset-4">
          The full scoring rules
        </Link>
      </details>
    </div>
  );
}
