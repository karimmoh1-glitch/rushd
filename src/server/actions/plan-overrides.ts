"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";
import { recordPlanSnapshot } from "@/lib/planning/snapshots";
import type { PlanTrigger } from "@/lib/planning/diff";
import { nextWeekStart, overrideRisk } from "@/lib/planning/overrides";
import { currentTime } from "@/lib/time/now";
import { formatDateKey, localDateKey, resolveTimeZone } from "@/lib/time/zone";

// The student's overrides on the plan: skip a block today, keep something out
// of this week, change an estimate. Every read and write is scoped to the
// session user (`where: { id, userId }`); ownership is tested in
// src/server/actions/plan-overrides.integration.test.ts.

export type OverrideResult = { error: string } | { success: true; risk?: string; message?: string };

const Target = z.object({
  kind: z.enum(["assignment", "exam", "review"]),
  /** Assignment or exam id; for a review block, the course id. */
  itemId: z.string().min(1).max(64),
});
type TargetInput = z.infer<typeof Target>;

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/plan");
}

async function userTimeZone(userId: string): Promise<string> {
  const profile = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return resolveTimeZone(profile?.timezone);
}

/** True when the item exists, is the student's, and is still open. */
async function ownsOpenTarget(userId: string, target: TargetInput): Promise<boolean> {
  if (target.kind === "assignment") {
    return Boolean(
      await db.assignment.findFirst({ where: { id: target.itemId, userId, status: { not: "COMPLETED" } }, select: { id: true } }),
    );
  }
  if (target.kind === "exam") {
    return Boolean(await db.exam.findFirst({ where: { id: target.itemId, userId }, select: { id: true } }));
  }
  return Boolean(await db.class.findFirst({ where: { id: target.itemId, userId, archived: false }, select: { id: true } }));
}

function overrideColumns(target: TargetInput) {
  return {
    assignmentId: target.kind === "assignment" ? target.itemId : null,
    examId: target.kind === "exam" ? target.itemId : null,
    classId: target.kind === "review" ? target.itemId : null,
  };
}

async function regenerate(userId: string, trigger: PlanTrigger, now: Date, estimateChanged: string[] = []) {
  try {
    return await recordPlanSnapshot(userId, trigger, { now, estimateChanged });
  } catch (error) {
    console.error("[plan-overrides] failed to regenerate the plan", error);
    return null;
  }
}

/** "Skip for today": keeps the item off today's plan (pinned blocks today
 * included) and lets the planner find time elsewhere. */
export async function skipForToday(input: TargetInput): Promise<OverrideResult> {
  const user = await requireUserOrThrow();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { error: "Invalid item." };
  const target = parsed.data;
  if (!(await ownsOpenTarget(user.id, target))) return { error: "That item isn't on your plan any more." };

  const now = await currentTime();
  const today = localDateKey(now, await userTimeZone(user.id));
  const columns = overrideColumns(target);
  const existing = await db.planOverride.findFirst({
    where: { userId: user.id, kind: "SKIP_DAY", localDate: today, ...columns },
    select: { id: true },
  });
  if (!existing) {
    await db.planOverride.create({ data: { userId: user.id, kind: "SKIP_DAY", localDate: today, ...columns } });
  }
  if (target.kind !== "review") {
    await db.scheduleBlock.deleteMany({
      where: { userId: user.id, localDate: today, assignmentId: columns.assignmentId, examId: columns.examId },
    });
  }

  await logEvent(user.id, "block_skipped", { kind: target.kind, itemId: target.itemId });
  const recorded = await regenerate(user.id, "block_skipped", now);
  revalidate();
  return { success: true, risk: recorded ? overrideRisk(recorded.plan, target, recorded.plan.timeZone, now) : undefined };
}

/** "Not this week": no planned time for the item until next Monday. */
export async function notThisWeek(input: TargetInput): Promise<OverrideResult> {
  const user = await requireUserOrThrow();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { error: "Invalid item." };
  const target = parsed.data;
  if (!(await ownsOpenTarget(user.id, target))) return { error: "That item isn't on your plan any more." };

  const now = await currentTime();
  const today = localDateKey(now, await userTimeZone(user.id));
  const resume = nextWeekStart(today);
  const columns = overrideColumns(target);
  await db.planOverride.deleteMany({ where: { userId: user.id, kind: "NOT_THIS_WEEK", ...columns } });
  await db.planOverride.create({ data: { userId: user.id, kind: "NOT_THIS_WEEK", localDate: resume, ...columns } });
  if (target.kind !== "review") {
    await db.scheduleBlock.deleteMany({
      where: { userId: user.id, localDate: { gte: today, lt: resume }, assignmentId: columns.assignmentId, examId: columns.examId },
    });
  }

  await logEvent(user.id, "override_applied", { type: "not_this_week", kind: target.kind, itemId: target.itemId });
  const recorded = await regenerate(user.id, "not_this_week", now);
  revalidate();
  return {
    success: true,
    message: `Off this week. Back on your plan from ${formatDateKey(resume, { weekday: "long", month: "short", day: "numeric" })}.`,
    risk: recorded ? overrideRisk(recorded.plan, target, recorded.plan.timeZone, now) : undefined,
  };
}

/** Undoes "skip for today" and "not this week" for one item. */
export async function clearOverrides(input: TargetInput): Promise<OverrideResult> {
  const user = await requireUserOrThrow();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { error: "Invalid item." };
  const target = parsed.data;
  const now = await currentTime();
  const today = localDateKey(now, await userTimeZone(user.id));
  const result = await db.planOverride.deleteMany({
    where: { userId: user.id, localDate: { gte: today }, ...overrideColumns(target) },
  });
  if (result.count === 0) return { error: "Nothing to undo." };
  await logEvent(user.id, "override_applied", { type: "cleared", kind: target.kind, itemId: target.itemId });
  await regenerate(user.id, "other", now);
  revalidate();
  return { success: true };
}

const EstimateInput = Target.extend({
  minutes: z.number().int().min(5, "Estimate at least 5 minutes.").max(3000, "Estimate 3000 minutes or less."),
});

/** Changes the student's own estimate (assignment minutes or exam prep). */
export async function changeEstimate(input: z.input<typeof EstimateInput>): Promise<OverrideResult> {
  const user = await requireUserOrThrow();
  const parsed = EstimateInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid estimate." };
  const { kind, itemId, minutes } = parsed.data;

  let updated = 0;
  if (kind === "assignment") {
    const result = await db.assignment.updateMany({
      where: { id: itemId, userId: user.id, status: { not: "COMPLETED" } },
      data: { estimatedMinutes: minutes, estimatedByRushd: false },
    });
    updated = result.count;
  } else if (kind === "exam") {
    if (minutes < 15) return { error: "Exam prep is at least 15 minutes." };
    const result = await db.exam.updateMany({ where: { id: itemId, userId: user.id }, data: { prepMinutes: minutes } });
    updated = result.count;
  } else {
    return { error: "Review blocks are sized from your topics; skip it or practice instead." };
  }
  if (updated === 0) return { error: "That item isn't on your plan any more." };

  const now = await currentTime();
  await logEvent(user.id, "override_applied", { type: "estimate", kind, itemId });
  const recorded = await regenerate(user.id, "estimate_changed", now, [`${kind}:${itemId}`]);
  revalidate();
  revalidatePath("/assignments");
  revalidatePath("/exams");
  return { success: true, risk: recorded ? overrideRisk(recorded.plan, { kind, itemId }, recorded.plan.timeZone, now) : undefined };
}

/** Hides the "What changed" note for one plan. */
export async function dismissPlanChange(planId: string): Promise<OverrideResult> {
  const user = await requireUserOrThrow();
  const id = z.string().min(1).max(64).safeParse(planId);
  if (!id.success) return { error: "Invalid plan." };
  const result = await db.plan.updateMany({ where: { id: id.data, userId: user.id }, data: { changesDismissedAt: new Date() } });
  if (result.count === 0) return { error: "Plan not found." };
  revalidate();
  return { success: true };
}

/** "Not now" on "Archive this course?". Rushd won't ask again for this course. */
export async function dismissArchiveSuggestion(classId: string): Promise<OverrideResult> {
  const user = await requireUserOrThrow();
  const id = z.string().min(1).max(64).safeParse(classId);
  if (!id.success) return { error: "Invalid course." };
  const result = await db.class.updateMany({
    where: { id: id.data, userId: user.id },
    data: { archiveSuggestionDismissedAt: new Date() },
  });
  if (result.count === 0) return { error: "Course not found." };
  await logEvent(user.id, "archive_suggestion_dismissed", { classId: id.data });
  revalidatePath("/dashboard");
  return { success: true };
}
