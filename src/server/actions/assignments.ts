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

export type ActionResult = { error: string } | { success: true };

async function assertOwnsClass(userId: string, classId: string) {
  const cls = await db.class.findFirst({
    where: { id: classId, userId },
    select: { id: true },
  });
  return Boolean(cls);
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
      completedAt: data.status === "COMPLETED" ? new Date() : null,
    },
    select: { id: true },
  });

  await logEvent(user.id, "assignment_created", { assignmentId: created.id });
  await regeneratePlanSnapshot(user.id);
  revalidatePath("/assignments");
  revalidatePath("/dashboard");
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
    select: { status: true },
  });
  if (!existing) return { error: "Assignment not found." };

  const result = await db.assignment.updateMany({
    where: { id, userId: user.id },
    data: {
      classId: data.classId,
      title: data.title,
      dueAt: new Date(data.dueAt),
      estimatedMinutes: data.estimatedMinutes,
      priority: data.priority,
      status: data.status,
      notes: data.notes || null,
      completedAt:
        data.status === "COMPLETED"
          ? (existing.status === "COMPLETED" ? undefined : new Date())
          : null,
    },
  });
  if (result.count === 0) return { error: "Assignment not found." };

  if (data.status === "COMPLETED" && existing.status !== "COMPLETED") {
    await logEvent(user.id, "assignment_completed", { assignmentId: id });
  }
  await regeneratePlanSnapshot(user.id);

  revalidatePath("/assignments");
  revalidatePath("/dashboard");
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

  await db.assignment.update({
    where: { id },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  if (status === "COMPLETED" && existing.status !== "COMPLETED") {
    await logEvent(user.id, "assignment_completed", { assignmentId: id });
  }
  await regeneratePlanSnapshot(user.id);

  revalidatePath("/assignments");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();

  const result = await db.assignment.deleteMany({
    where: { id, userId: user.id },
  });
  if (result.count === 0) return { error: "Assignment not found." };

  await regeneratePlanSnapshot(user.id);
  revalidatePath("/assignments");
  revalidatePath("/dashboard");
  return { success: true };
}
