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

type DifficultyRow = ReturnType<typeof buildInsights>["difficulty"][number];

// The class that least and most often felt harder than expected.
// Returns null when there is no data, or when both would be the same class.
function findStrongestAndHardest(rows: DifficultyRow[]) {
  if (rows.length === 0) return null;
  let strongest = rows[0];
  let hardest = rows[0];
  for (const row of rows) {
    if (row.harderShare < strongest.harderShare) strongest = row;
    if (row.harderShare > hardest.harderShare) hardest = row;
  }
  if (strongest.className === hardest.className) return null;
  return { strongest, hardest };
}

// e.g. "11th grade · Lincoln High"
function describeStudent(grade: number | null | undefined, school: string | null | undefined): string {
  const parts: string[] = [];
  if (grade) parts.push(`${grade}th grade`);
  if (school) parts.push(school);
  if (parts.length === 0) return "How Rushd sees your academic life.";
  return parts.join(" · ");
}

function StatCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function SubjectCard({
  heading,
  headingColor,
  classColor,
  subjectName,
  note,
}: {
  heading: string;
  headingColor: string;
  classColor: string;
  subjectName: string;
  note: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className={`text-xs font-semibold tracking-wide ${headingColor} uppercase`}>
          {heading}
        </p>
        <p className="mt-1 flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: classColor }}
          />
          {subjectName}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {note}
        </p>
      </CardContent>
    </Card>
  );
}

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

  const sessions: SessionRecord[] = sessionRows.map((row) => ({
    className: row.className,
    classColor: row.classColor,
    status: row.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: row.plannedMinutes,
    actualMinutes: row.actualMinutes,
    perceivedDifficulty: row.perceivedDifficulty,
    startedAt: row.startedAt,
  }));
  const insights = buildInsights(sessions);

  const availableDays = new Set(availability.map((window) => window.dayOfWeek)).size;
  let weeklyAvailableMinutes = 0;
  for (const window of availability) {
    weeklyAvailableMinutes += Math.max(0, window.endMinute - window.startMinute);
  }

  const subjects = findStrongestAndHardest(insights.difficulty);

  const challenge = profile?.primaryChallenge
    ? CHALLENGE_OPTIONS.find((option) => option.value === profile.primaryChallenge)
    : null;

  let completionText = "—";
  if (insights.overallCompletionRate !== null) {
    completionText = `${Math.round(insights.overallCompletionRate * 100)}%`;
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">
          {profile?.displayName ?? "Your"}&apos;s Academic Profile
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {describeStudent(profile?.grade, profile?.school)}
        </p>
      </div>

      {challenge && (
        <div>
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
        </div>
      )}

      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard value={classes.length} label="Active classes" />
          <StatCard value={availableDays} label="Days available to study" />
          <StatCard value={formatDuration(weeklyAvailableMinutes)} label="Available per week" />
          <StatCard value={completionText} label="Sessions completed" />
        </div>
      </div>

      <div>
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
            <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
            Your classes
          </h2>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes yet —{" "}
              <Link href="/courses" className="underline underline-offset-4">
                add your first one
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((course) => (
                <span
                  key={course.id}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: course.color }}
                  />
                  {course.name}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      {subjects && (
        <div>
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              Strongest and toughest subjects
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <SubjectCard
                heading="Strongest"
                headingColor="text-success"
                classColor={subjects.strongest.classColor}
                subjectName={subjects.strongest.className}
                note="Rarely feels harder than expected."
              />
              <SubjectCard
                heading="Most difficult"
                headingColor="text-warning"
                classColor={subjects.hardest.classColor}
                subjectName={subjects.hardest.className}
                note={<>Felt harder than expected {Math.round(subjects.hardest.harderShare * 100)}% of the time.</>}
              />
            </div>
          </section>
        </div>
      )}

      <div>
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
              <Link href="/mastery/habits" className="underline underline-offset-4">
                Insights
              </Link>{" "}
              for the full breakdown.
            </p>
          )}
        </section>
      </div>

      <div>
        <Link
          href="/how-rushd-thinks"
          className="block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          See how Rushd calculates all of this →
        </Link>
      </div>
    </div>
  );
}
