import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { logEvent } from "@/lib/analytics/log-event";
import { toColumns } from "@/lib/courses/service";
import { OnboardingSchema, type OnboardingData, type OnboardingInput } from "@/lib/validation/onboarding-setup";

// Finishing onboarding in one transaction: profile, study time, the courses
// the student picked (with any details), and the work they typed. Everything
// is written under the signed-in student's own userId. Running it twice is a
// no-op, so a double submit can't duplicate courses or work.

const DAY_MS = 86_400_000;

export type OnboardingOutcome =
  | { ok: false; error: string }
  | { ok: true; alreadyDone: boolean; courseCount: number; workCount: number; availabilityWindowCount: number };

/** Due dates far in the past or future are almost certainly parse mistakes. */
function dueInRange(dueAt: string, now: Date): boolean {
  const time = Date.parse(dueAt);
  return time > now.getTime() - 30 * DAY_MS && time < now.getTime() + 365 * DAY_MS;
}

export async function completeOnboardingFor(userId: string, input: OnboardingInput, now = new Date()): Promise<OnboardingOutcome> {
  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data: OnboardingData = parsed.data;
  const work = data.work.filter((item) => dueInRange(item.dueAt, now));

  const profileFields = {
    displayName: data.displayName,
    grade: data.grade,
    school: data.school || null,
    timezone: data.timezone,
    goals: data.goals || null,
    primaryChallenge: data.primaryChallenge,
    studyLevel: data.studyLevel,
    emailReminders: data.emailReminders,
    // Undefined keeps the default when the student didn't choose.
    preferredSessionMinutes: data.preferredSessionMinutes || undefined,
  };

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { onboardingCompletedAt: true, createdAt: true } });
    if (user.onboardingCompletedAt) return { alreadyDone: true as const, createdAt: user.createdAt, courseIds: [] as string[] };

    await tx.profile.upsert({ where: { userId }, create: { userId, ...profileFields }, update: profileFields });

    if (data.availability.length > 0) {
      await tx.studyAvailability.createMany({ data: data.availability.map((window) => ({ userId, ...window })) });
    }

    // One at a time so each work item can point at its course.
    const courseIds: string[] = [];
    for (const course of data.courses) {
      const created = await tx.class.create({ data: { userId, ...toColumns(course) }, select: { id: true } });
      courseIds.push(created.id);
    }

    const assignments: Prisma.AssignmentCreateManyInput[] = [];
    const exams: Prisma.ExamCreateManyInput[] = [];
    for (const item of work) {
      const classId = courseIds[item.courseIndex];
      if (item.kind === "assignment") {
        assignments.push({ userId, classId, title: item.title, dueAt: new Date(item.dueAt), estimatedMinutes: item.minutes });
      } else {
        exams.push({ userId, classId, title: item.title, examAt: new Date(item.dueAt), prepMinutes: item.minutes });
      }
    }
    if (assignments.length > 0) await tx.assignment.createMany({ data: assignments });
    if (exams.length > 0) await tx.exam.createMany({ data: exams });

    await tx.user.update({ where: { id: userId }, data: { onboardingCompletedAt: now } });
    return { alreadyDone: false as const, createdAt: user.createdAt, courseIds };
  });

  if (result.alreadyDone) {
    return { ok: true, alreadyDone: true, courseCount: 0, workCount: 0, availabilityWindowCount: 0 };
  }

  // Analytics: catalog ids and counts only, never what the student typed.
  for (const course of data.courses) {
    await logEvent(userId, "course_added", { catalogId: course.catalogId ?? null, custom: !course.catalogId, level: course.level ?? null, via: "onboarding" });
  }
  const assignmentCount = work.filter((item) => item.kind === "assignment").length;
  const examCount = work.length - assignmentCount;
  if (assignmentCount > 0) await logEvent(userId, "assignment_created", { count: assignmentCount, via: "onboarding" });
  if (examCount > 0) await logEvent(userId, "exam_created", { count: examCount, via: "onboarding" });
  await logEvent(userId, "onboarding_completed", {
    timeToCompleteSeconds: Math.max(0, Math.round((now.getTime() - result.createdAt.getTime()) / 1000)),
    level: data.studyLevel,
    classCount: data.courses.length,
    catalogCourseCount: data.courses.filter((course) => course.catalogId).length,
    customCourseCount: data.courses.filter((course) => !course.catalogId).length,
    coursesWithDetails: data.courses.filter((course) => course.institution || course.code || course.termStart || course.termEnd || course.weeklyHours).length,
    workItemCount: work.length,
    availabilityWindowCount: data.availability.length,
  });

  return { ok: true, alreadyDone: false, courseCount: data.courses.length, workCount: work.length, availabilityWindowCount: data.availability.length };
}
