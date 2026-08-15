import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { dateKey } from "@/lib/planning";
import { formatDueDate, formatDuration, formatDaysUntil } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TodayPlanItem } from "./today-plan-item";
import { WorkloadBars } from "./workload-bars";
import { AddAssignmentButton } from "../assignments/add-assignment-button";
import { AddExamButton } from "../exams/add-exam-button";
import { QuickAdd } from "./quick-add";

export const metadata: Metadata = {
  title: "Dashboard",
};

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const today = dateKey(now);

  const [classes, plan, overdueAssignments, upcomingAssignments, upcomingExams, completedThisWeek] =
    await Promise.all([
      db.class.findMany({
        where: { userId: user.id, archived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true },
      }),
      generatePlanForUser(user.id, now),
      db.assignment.findMany({
        where: { userId: user.id, status: { not: "COMPLETED" }, dueAt: { lt: now } },
        orderBy: { dueAt: "asc" },
        take: 5,
        select: { id: true, title: true, dueAt: true, class: { select: { name: true, color: true } } },
      }),
      db.assignment.findMany({
        where: { userId: user.id, status: { not: "COMPLETED" }, dueAt: { gte: now } },
        orderBy: { dueAt: "asc" },
        take: 5,
        select: { id: true, title: true, dueAt: true, class: { select: { name: true, color: true } } },
      }),
      db.exam.findMany({
        where: { userId: user.id, examAt: { gte: now } },
        orderBy: { examAt: "asc" },
        take: 5,
        select: { id: true, title: true, examAt: true, class: { select: { name: true, color: true } } },
      }),
      db.assignment.count({
        where: {
          userId: user.id,
          status: "COMPLETED",
          completedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  const todaySessions = plan.sessions.filter((s) => s.scheduledDate === today);

  // Fallback: if nothing landed on today's schedule (no availability set,
  // or today's capacity went to other days), still surface the highest
  // priority work so the dashboard never shows an empty "today" when work
  // actually exists.
  const fallbackItems =
    todaySessions.length === 0 ? plan.scored.slice(0, 3) : [];

  const workloadDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(date);
    const minutes = plan.sessions
      .filter((s) => s.scheduledDate === key)
      .reduce((sum, s) => sum + s.scheduledMinutes, 0);
    return { date, minutes };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {greeting(now)}, {user.profile?.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/import">
            <Button variant="outline">
              <Upload className="h-4 w-4" />
              Upload screenshot
            </Button>
          </Link>
          <AddAssignmentButton classes={classes} />
          <AddExamButton classes={classes} />
        </div>
      </div>

      <QuickAdd classes={classes} />

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold text-destructive">
              {overdueAssignments.length}
            </p>
            <p className="text-sm text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{upcomingAssignments.length}</p>
            <p className="text-sm text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold text-success">{completedThisWeek}</p>
            <p className="text-sm text-muted-foreground">Done this week</p>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Today&apos;s plan</h2>
        {todaySessions.length > 0 ? (
          <div className="space-y-2">
            {todaySessions.map((s, i) => (
              <TodayPlanItem
                key={`${s.item.id}-${i}`}
                itemId={s.item.id}
                itemKind={s.item.kind}
                assignmentId={s.item.kind === "assignment" ? s.item.id : null}
                title={s.item.title}
                className={s.item.className}
                classColor={s.item.classColor}
                scheduledMinutes={s.scheduledMinutes}
                reasonCode={s.reasonCode}
              />
            ))}
          </div>
        ) : fallbackItems.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing scheduled for today yet — set your study availability in{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Settings
              </Link>{" "}
              so Rushd can suggest specific times. Here&apos;s what matters most:
            </p>
            <div className="space-y-2">
              {fallbackItems.map((s, i) => (
                <TodayPlanItem
                  key={`${s.item.id}-${i}`}
                  itemId={s.item.id}
                  itemKind={s.item.kind}
                  assignmentId={s.item.kind === "assignment" ? s.item.id : null}
                  title={s.item.title}
                  className={s.item.className}
                  classColor={s.item.classColor}
                  scheduledMinutes={s.item.remainingMinutes}
                  reasonCode={s.reasonCode}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-muted-foreground">
              You&apos;re all caught up. Nothing due right now.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">Overdue</h2>
          {overdueAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing overdue.</p>
          ) : (
            <div className="space-y-2">
              {overdueAssignments.map((a) => (
                <Link
                  key={a.id}
                  href="/assignments"
                  className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm hover:bg-destructive/10"
                >
                  <span className="truncate">{a.title}</span>
                  <Badge variant="destructive" className="shrink-0">
                    {formatDueDate(a.dueAt)}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">Upcoming exams</h2>
          {upcomingExams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exams scheduled.</p>
          ) : (
            <div className="space-y-2">
              {upcomingExams.map((e) => (
                <Link
                  key={e.id}
                  href="/exams"
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="truncate">{e.title}</span>
                  <Badge variant="outline" className="shrink-0 border-warning text-warning">
                    {formatDaysUntil(e.examAt)}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Upcoming deadlines</h2>
        {upcomingAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the horizon.</p>
        ) : (
          <div className="space-y-2">
            {upcomingAssignments.map((a) => (
              <Link
                key={a.id}
                href="/assignments"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.class.color }}
                  />
                  {a.title}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDueDate(a.dueAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">This week&apos;s workload</h2>
        <Card>
          <CardContent className="py-4">
            <WorkloadBars days={workloadDays} />
            {Object.keys(plan.unscheduledMinutesByItem).length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {formatDuration(
                  Object.values(plan.unscheduledMinutesByItem).reduce((a, b) => a + b, 0),
                )}{" "}
                of work doesn&apos;t fit in your available study time this week.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
