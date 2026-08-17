import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Clock, Target, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { buildInsights, type SessionRecord } from "@/lib/insights/build-insights";
import { CHALLENGE_OPTIONS } from "@/lib/validation/onboarding";
import { logEvent } from "@/lib/analytics/log-event";
import { formatDuration } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Academic Profile",
};

const CHALLENGE_ADVICE: Record<string, string> = {
  TOO_MANY_ASSIGNMENTS:
    "That's what One Thing on your dashboard is for — Rushd narrows everything down to the single most important thing to do right now.",
  PROCRASTINATION:
    "Rushd's scoring gives overdue work an automatic boost, so procrastinated tasks climb back to the top instead of getting buried.",
  POOR_TIME_ESTIMATION:
    "The estimate accuracy below is Rushd learning your real pace, class by class — the more sessions you log, the sharper it gets.",
  EXAM_STRESS:
    "Exam prep gets spread across multiple days automatically (capped at 90 min/day) instead of piling up the night before.",
  STAYING_ORGANIZED:
    "Classes, assignments, and exams all live in one place here — nothing to track across five different apps.",
};

export default async function ProfilePage() {
  const user = await requireUser();

  const [profile, classes, availability, sessionRows] = await Promise.all([
    db.profile.findUnique({
      where: { userId: user.id },
      select: { displayName: true, grade: true, school: true, primaryChallenge: true },
    }),
    db.class.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, priority: true },
    }),
    db.studyAvailability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
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
    logEvent(user.id, "profile_viewed"),
  ]);

  const sessions: SessionRecord[] = sessionRows.map((r) => ({
    className: r.className,
    classColor: r.classColor,
    status: r.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: r.plannedMinutes,
    actualMinutes: r.actualMinutes,
    perceivedDifficulty: r.perceivedDifficulty,
    startedAt: r.startedAt,
  }));
  const insights = buildInsights(sessions);

  const availableDays = new Set(availability.map((w) => w.dayOfWeek)).size;
  const weeklyAvailableMinutes = availability.reduce(
    (sum, w) => sum + Math.max(0, w.endMinute - w.startMinute),
    0,
  );

  const strongest = insights.difficulty.length > 0 ? [...insights.difficulty].sort((a, b) => a.harderShare - b.harderShare)[0] : null;
  const hardest = insights.difficulty.length > 0 ? [...insights.difficulty].sort((a, b) => b.harderShare - a.harderShare)[0] : null;
  const showStrongestAndHardest = strongest && hardest && strongest.className !== hardest.className;

  const challenge = profile?.primaryChallenge
    ? CHALLENGE_OPTIONS.find((c) => c.value === profile.primaryChallenge)
    : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-heading text-3xl font-semibold">
          {profile?.displayName ?? "Your"}&apos;s Academic Profile
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          {[profile?.grade ? `${profile.grade}th grade` : null, profile?.school]
            .filter(Boolean)
            .join(" · ") || "How Rushd sees your academic life."}
        </p>
      </div>

      {challenge && (
        <Reveal>
          <Card className="border-primary/40 bg-accent/30">
            <CardContent className="flex items-start gap-3 py-4">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">
                  Your biggest challenge: {challenge.label}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {CHALLENGE_ADVICE[challenge.value]}
                </p>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.06}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold">{classes.length}</p>
              <p className="text-sm text-muted-foreground">Active classes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold">{availableDays}</p>
              <p className="text-sm text-muted-foreground">Days available to study</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold">{formatDuration(weeklyAvailableMinutes)}</p>
              <p className="text-sm text-muted-foreground">Available per week</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold">
                {insights.overallCompletionRate !== null
                  ? `${Math.round(insights.overallCompletionRate * 100)}%`
                  : "—"}
              </p>
              <p className="text-sm text-muted-foreground">Sessions completed</p>
            </CardContent>
          </Card>
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
            <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
            Your classes
          </h2>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes yet —{" "}
              <Link href="/classes" className="underline underline-offset-4">
                add your first one
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {showStrongestAndHardest && (
        <Reveal delay={0.18}>
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              Strongest and toughest subjects
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs font-semibold tracking-wide text-success uppercase">
                    Strongest
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-medium">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: strongest.classColor }}
                    />
                    {strongest.className}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Rarely feels harder than expected.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs font-semibold tracking-wide text-warning uppercase">
                    Most difficult
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-medium">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: hardest.classColor }}
                    />
                    {hardest.className}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Felt harder than expected {Math.round(hardest.harderShare * 100)}% of the time.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>
        </Reveal>
      )}

      <Reveal delay={0.24}>
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            Work habits
          </h2>
          {insights.busiestDay || insights.timeOfDay ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              {insights.busiestDay && (
                <p>
                  <span className="font-medium text-foreground">{insights.busiestDay.dayLabel}</span> is
                  your busiest study day.
                </p>
              )}
              {insights.timeOfDay && (
                <p>
                  You complete{" "}
                  <span className="font-medium text-foreground">
                    {Math.round(insights.timeOfDay.beforeRate * 100)}%
                  </span>{" "}
                  of sessions started before 6 PM, vs{" "}
                  <span className="font-medium text-foreground">
                    {Math.round(insights.timeOfDay.afterRate * 100)}%
                  </span>{" "}
                  after.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Log a few more study sessions and Rushd will start noticing your patterns. See{" "}
              <Link href="/insights" className="underline underline-offset-4">
                Insights
              </Link>{" "}
              for the full breakdown.
            </p>
          )}
        </section>
      </Reveal>

      <Reveal delay={0.3}>
        <Link
          href="/how-rushd-thinks"
          className="block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          See how Rushd calculates all of this →
        </Link>
      </Reveal>
    </div>
  );
}
