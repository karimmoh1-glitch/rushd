"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import {
  AssignmentSchema,
  type AssignmentInput,
} from "@/lib/validation/assignments";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { assertOwnsClass } from "@/server/actions/class-ownership";

export type ActionResult = { error: string } | { success: true };

function revalidateAssignmentPages() {
  revalidatePath("/assignments");
  revalidatePath("/dashboard");
}

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

export async function createAssignment(
  input: AssignmentInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
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
  revalidateAssignmentPages();
  return { success: true };
}

export async function updateAssignment(
  id: string,
  input: AssignmentInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
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

  revalidateAssignmentPages();
  revalidatePath("/plan");
  return { success: true };
}

export async function setAssignmentStatus(
  id: string,
  status: AssignmentInput["status"],
): Promise<ActionResult> {
  const user = await requireUserOrThrow();

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

  revalidateAssignmentPages();
  revalidatePath("/plan");
  return { success: true };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();

  const result = await db.assignment.deleteMany({
    where: { id, userId: user.id },
  });
  if (result.count === 0) return { error: "Assignment not found." };

  await regeneratePlanSnapshot(user.id);
  revalidateAssignmentPages();
  return { success: true };
}
