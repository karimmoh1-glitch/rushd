import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logEvent } from "@/lib/analytics/log-event";
import { localDateKey } from "@/lib/time/zone";
import { DEFAULT_HORIZON_DAYS } from "./constants";
import { generatePlanForUser, type UserPlan } from "./generate-for-user";
import {
  diffPlans,
  itemKeyOf,
  missedBlocks,
  parseSnapshot,
  snapshotFromSessions,
  summarizeChanges,
  type ChangeContext,
  type PlanChange,
  type PlanSnapshot,
  type PlanTrigger,
} from "./diff";

// Plan history: every regeneration stores a compact snapshot of the shown week
// on a Plan row (plus PlanItem rows for analytics), and the "what changed"
// against the previous one. Today and /plan show the latest note.

/** A change note stays on screen this long unless the student dismisses it. */
const CHANGE_NOTE_HOURS = 72;

export interface RecordOptions {
  now: Date;
  /** Reuse a plan that was just computed for `now`. */
  plan?: UserPlan;
  /** Items whose estimate the student just changed. */
  estimateChanged?: string[];
}

export interface RecordedPlan {
  planId: string;
  plan: UserPlan;
  changes: PlanChange[];
}

async function latestSnapshotRow(userId: string) {
  return db.plan.findFirst({
    where: { userId, snapshot: { not: Prisma.AnyNull } },
    orderBy: { generatedAt: "desc" },
    select: { id: true, generatedAt: true, snapshot: true },
  });
}

/** What happened between the previous plan and now, read from the database. */
async function changeContext(
  userId: string,
  trigger: PlanTrigger,
  previous: { generatedAt: Date; snapshot: PlanSnapshot } | null,
  next: PlanSnapshot,
  plan: UserPlan,
  now: Date,
  estimateChanged: string[],
): Promise<ChangeContext> {
  const today = localDateKey(now, plan.timeZone);
  const ctx: ChangeContext = { trigger, today, estimateChanged: new Set(estimateChanged) };
  if (!previous) return ctx;
  const since = previous.generatedAt;

  const prevAssignmentIds = previous.snapshot.items.filter((i) => i.kind === "assignment").map((i) => i.id);
  const nextIds = next.items.filter((i) => i.kind !== "review").map((i) => i.id);
  const firstDay = previous.snapshot.today;

  const [completed, addedAssignments, addedExams, overrides, sessions] = await Promise.all([
    prevAssignmentIds.length
      ? db.assignment.findMany({ where: { userId, id: { in: prevAssignmentIds }, status: "COMPLETED" }, select: { id: true } })
      : Promise.resolve([]),
    nextIds.length
      ? db.assignment.findMany({ where: { userId, id: { in: nextIds }, createdAt: { gt: since } }, select: { id: true } })
      : Promise.resolve([]),
    nextIds.length
      ? db.exam.findMany({ where: { userId, id: { in: nextIds }, createdAt: { gt: since } }, select: { id: true } })
      : Promise.resolve([]),
    // Active overrides: a skip for today, or a "not this week" still in force.
    // (An override that was already in place before the previous plan didn't
    // move anything between the two, so it never gets credit for a change.)
    db.planOverride.findMany({
      where: { userId, localDate: { gte: today } },
      select: { kind: true, assignmentId: true, examId: true, classId: true, localDate: true },
    }),
    db.studySession.findMany({
      where: { userId, status: "COMPLETED", startedAt: { gte: new Date(since.getTime() - 36 * 60 * 60 * 1000) } },
      select: { assignmentId: true, examId: true, startedAt: true },
    }),
  ]);

  ctx.completed = new Set(completed.map((a) => itemKeyOf("assignment", a.id)));
  ctx.added = new Set([...addedAssignments.map((a) => itemKeyOf("assignment", a.id)), ...addedExams.map((e) => itemKeyOf("exam", e.id))]);
  ctx.skipped = new Set();
  ctx.notThisWeek = new Set();
  for (const o of overrides) {
    const key = o.assignmentId
      ? itemKeyOf("assignment", o.assignmentId)
      : o.examId
        ? itemKeyOf("exam", o.examId)
        : o.classId
          ? itemKeyOf("review", o.classId)
          : null;
    if (!key) continue;
    if (o.kind === "SKIP_DAY" && o.localDate === today) ctx.skipped.add(key);
    if (o.kind === "NOT_THIS_WEEK") ctx.notThisWeek.add(key);
  }
  ctx.studied = new Set();
  for (const s of sessions) {
    const key = s.assignmentId ? itemKeyOf("assignment", s.assignmentId) : s.examId ? itemKeyOf("exam", s.examId) : null;
    const day = localDateKey(s.startedAt, plan.timeZone);
    if (key && day >= firstDay) ctx.studied.add(`${key}@${day}`);
  }
  return ctx;
}

/**
 * Regenerates the plan, diffs it against the last stored one, and stores the
 * new snapshot with its trigger and changes. Logs plan_generated (sessions)
 * and plan_regenerated (reason, change count). Ids and counts only.
 */
export async function recordPlanSnapshot(userId: string, trigger: PlanTrigger, options: RecordOptions): Promise<RecordedPlan> {
  const { now } = options;
  const plan = options.plan ?? (await generatePlanForUser(userId, now));
  const today = localDateKey(now, plan.timeZone);
  const next = snapshotFromSessions(plan.sessions, today);

  const previousRow = await latestSnapshotRow(userId);
  const previousSnapshot = previousRow ? parseSnapshot(previousRow.snapshot) : null;
  const previous = previousRow && previousSnapshot ? { generatedAt: previousRow.generatedAt, snapshot: previousSnapshot } : null;

  const ctx = await changeContext(userId, trigger, previous, next, plan, now, options.estimateChanged ?? []);
  let effectiveTrigger = trigger;
  if (trigger === "new_day" && previous && missedBlocks(previous.snapshot, ctx).size > 0) {
    effectiveTrigger = "missed_session";
    ctx.trigger = effectiveTrigger;
  }
  const changes = diffPlans(previous?.snapshot ?? null, next, ctx);

  // Plans are ordered by generatedAt. Keep that strictly increasing per student,
  // even when two regenerations land on the same millisecond (or a pinned test clock).
  const generatedAt =
    previousRow && previousRow.generatedAt.getTime() >= now.getTime() ? new Date(previousRow.generatedAt.getTime() + 1) : now;
  const created = await db.plan.create({
    data: {
      userId,
      generatedAt,
      horizonDays: DEFAULT_HORIZON_DAYS,
      trigger: effectiveTrigger,
      snapshot: next as unknown as Prisma.InputJsonValue,
      changes: changes as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const rows = [];
  for (const session of plan.sessions) {
    if (session.item.kind === "review") continue; // reviews live in the snapshot only
    rows.push({
      planId: created.id,
      userId,
      assignmentId: session.item.kind === "assignment" ? session.item.id : null,
      examId: session.item.kind === "exam" ? session.item.id : null,
      // A calendar day, stored as UTC midnight so it reads back the same on any server.
      scheduledDate: new Date(`${session.scheduledDate}T00:00:00.000Z`),
      scheduledMinutes: session.scheduledMinutes,
      score: session.score,
      reasonCode: session.reasonCode,
    });
  }
  if (rows.length > 0) await db.planItem.createMany({ data: rows });

  await logEvent(userId, "plan_generated", { sessionCount: plan.sessions.length, workItemCount: plan.scored.length });
  await logEvent(userId, "plan_regenerated", { reason: effectiveTrigger, changes: changes.length, sessionCount: plan.sessions.length });
  return { planId: created.id, plan, changes };
}

/**
 * Called when Today or /plan renders: if the last stored plan is from an
 * earlier day, store today's (trigger "missed_session" when a planned block
 * passed without a study session, else "new_day"). At most one write per
 * student per day; never throws.
 */
export async function rollPlanForward(userId: string, plan: UserPlan, now: Date): Promise<void> {
  try {
    const latest = await latestSnapshotRow(userId);
    const today = localDateKey(now, plan.timeZone);
    const snapshot = latest ? parseSnapshot(latest.snapshot) : null;
    if (snapshot && snapshot.today >= today) return;
    await recordPlanSnapshot(userId, snapshot ? "new_day" : "other", { now, plan });
  } catch (error) {
    console.error("[plans] failed to roll the plan forward", error);
  }
}

export interface ChangeNote {
  planId: string;
  trigger: string;
  generatedAt: Date;
  sentences: string[];
}

/** The latest plan's "what changed", if there's something worth showing.
 * Logs plan_change_shown the first time it's shown. */
export async function latestChangeNote(userId: string, now: Date, timeZone: string, markShown: boolean): Promise<ChangeNote | null> {
  const latest = await db.plan.findFirst({
    where: { userId },
    orderBy: { generatedAt: "desc" },
    select: { id: true, trigger: true, generatedAt: true, changes: true, changesShownAt: true, changesDismissedAt: true },
  });
  if (!latest || !latest.trigger || latest.trigger === "new_day" || latest.changesDismissedAt) return null;
  if (now.getTime() - latest.generatedAt.getTime() > CHANGE_NOTE_HOURS * 60 * 60 * 1000) return null;
  const changes = Array.isArray(latest.changes) ? (latest.changes as unknown as PlanChange[]) : [];
  if (changes.length === 0) return null;
  const sentences = summarizeChanges(changes, localDateKey(now, timeZone));
  if (markShown && !latest.changesShownAt) {
    const updated = await db.plan.updateMany({ where: { id: latest.id, userId, changesShownAt: null }, data: { changesShownAt: now } });
    if (updated.count > 0) await logEvent(userId, "plan_change_shown", { planId: latest.id, changes: changes.length, reason: latest.trigger });
  }
  return { planId: latest.id, trigger: latest.trigger, generatedAt: latest.generatedAt, sentences };
}
