import "server-only";
import { db } from "@/lib/db";
import { AssignmentSchema, type AssignmentInput } from "@/lib/validation/assignments";
import { IdSchema } from "@/lib/validation/import";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { assertOwnsClass } from "@/server/actions/class-ownership";

// Creating and editing a student's assignments. Shared by the web's server
// actions (src/server/actions/assignments.ts) and the native app's API
// (/api/v1/assignments). The caller supplies the signed-in user's id; every
// query is scoped to it, and the class must be the student's own.

export type ServiceResult = { error: string } | { success: true };
export type CreateResult = { error: string } | { success: true; id: string };

/** What completedAt should become. undefined means "leave it unchanged". */
function completedAtFor(newStatus: string, oldStatus: string): Date | null | undefined {
  if (newStatus !== "COMPLETED") {
    return null;
  }
  if (oldStatus === "COMPLETED") {
    // Already completed: keep the original completion time.
    return undefined;
  }
  return new Date();
}

/** Runs when an assignment moves to COMPLETED. */
async function onAssignmentCompleted(userId: string, assignmentId: string) {
  await logEvent(userId, "assignment_completed", { assignmentId });
  // Finished work doesn't need the study time the student pinned for it.
  await db.scheduleBlock.deleteMany({ where: { userId, assignmentId } });
}

export async function createAssignmentForUser(
  userId: string,
  input: AssignmentInput,
): Promise<CreateResult> {
  const user = { id: userId };
  const parsed = AssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (!(await assertOwnsClass(user.id, data.classId))) {
    return { error: "Class not found." };
  }

  const created = await db.assignment.create({
    data: {
      userId: user.id,
      classId: data.classId,
      title: data.title,
      dueAt: new Date(data.dueAt),
      estimatedMinutes: data.estimatedMinutes,
      priority: data.priority,
      status: data.status,
      notes: data.notes || null,
      weightPercent: data.weightPercent ?? null,
      completedAt: data.status === "COMPLETED" ? new Date() : null,
    },
    select: { id: true },
  });

  await logEvent(user.id, "assignment_created", { assignmentId: created.id });
  await regeneratePlanSnapshot(user.id, "assignment_added");
  return { success: true, id: created.id };
}

export async function updateAssignmentForUser(
  userId: string,
  id: string,
  input: AssignmentInput,
): Promise<ServiceResult> {
  const user = { id: userId };
  if (!IdSchema.safeParse(id).success) return { error: "Assignment not found." };
  const parsed = AssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (!(await assertOwnsClass(user.id, data.classId))) {
    return { error: "Class not found." };
  }

  const existing = await db.assignment.findFirst({
    where: { id, userId: user.id },
    select: {
      status: true,
      source: true,
      title: true,
      dueAt: true,
      classId: true,
      estimatedMinutes: true,
      estimatedByRushd: true,
    },
  });
  if (!existing) return { error: "Assignment not found." };

  // Canvas owns the title, due date and course of imported work (the next sync
  // would overwrite edits anyway). The student's own fields are always theirs.
  let classId = data.classId;
  let title = data.title;
  let dueAt = new Date(data.dueAt);
  if (existing.source === "CANVAS") {
    classId = existing.classId;
    title = existing.title;
    dueAt = existing.dueAt;
  }

  // Once the student sets their own estimate, syncs stop touching it.
  const estimateUnchanged = data.estimatedMinutes === existing.estimatedMinutes;
  const estimatedByRushd = existing.estimatedByRushd && estimateUnchanged;

  const result = await db.assignment.updateMany({
    where: { id, userId: user.id },
    data: {
      classId,
      title,
      dueAt,
      estimatedMinutes: data.estimatedMinutes,
      estimatedByRushd,
      priority: data.priority,
      status: data.status,
      notes: data.notes || null,
      weightPercent: data.weightPercent,
      completedAt: completedAtFor(data.status, existing.status),
    },
  });
  if (result.count === 0) return { error: "Assignment not found." };

  const newlyCompleted = data.status === "COMPLETED" && existing.status !== "COMPLETED";
  if (newlyCompleted) {
    await onAssignmentCompleted(user.id, id);
  }
  await regeneratePlanSnapshot(user.id, newlyCompleted ? "assignment_completed" : estimateUnchanged ? "other" : "estimate_changed", {
    estimateChanged: estimateUnchanged ? [] : [`assignment:${id}`],
  });
  return { success: true };
}

export async function setAssignmentStatusForUser(
  userId: string,
  id: string,
  status: AssignmentInput["status"],
): Promise<ServiceResult> {
  const user = { id: userId };
  if (!IdSchema.safeParse(id).success) return { error: "Assignment not found." };
  if (!AssignmentSchema.shape.status.safeParse(status).success) return { error: "Invalid status." };

  const existing = await db.assignment.findFirst({
    where: { id, userId: user.id },
    select: { status: true },
  });
  if (!existing) return { error: "Assignment not found." };

  let completedAt: Date | null = null;
  if (status === "COMPLETED") {
    completedAt = new Date();
  }
  await db.assignment.updateMany({
    where: { id, userId: user.id },
    data: { status, completedAt },
  });

  const newlyCompleted = status === "COMPLETED" && existing.status !== "COMPLETED";
  if (newlyCompleted) {
    await onAssignmentCompleted(user.id, id);
  }
  await regeneratePlanSnapshot(user.id, newlyCompleted ? "assignment_completed" : "other");
  return { success: true };
}
