"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { ExamSchema, type ExamInput } from "@/lib/validation/exams";
import { logEvent } from "@/lib/analytics/log-event";

export type ActionResult = { error: string } | { success: true };

async function assertOwnsClass(userId: string, classId: string) {
  const cls = await db.class.findFirst({
    where: { id: classId, userId },
    select: { id: true },
  });
  return Boolean(cls);
}

export async function createExam(input: ExamInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = ExamSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (!(await assertOwnsClass(user.id, data.classId))) {
    return { error: "Class not found." };
  }

  const created = await db.exam.create({
    data: {
      userId: user.id,
      classId: data.classId,
      title: data.title,
      examAt: new Date(data.examAt),
      prepMinutes: data.prepMinutes,
      priority: data.priority,
      notes: data.notes || null,
    },
    select: { id: true },
  });

  await logEvent(user.id, "exam_created", { examId: created.id });
  revalidatePath("/exams");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateExam(
  id: string,
  input: ExamInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = ExamSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (!(await assertOwnsClass(user.id, data.classId))) {
    return { error: "Class not found." };
  }

  const result = await db.exam.updateMany({
    where: { id, userId: user.id },
    data: {
      classId: data.classId,
      title: data.title,
      examAt: new Date(data.examAt),
      prepMinutes: data.prepMinutes,
      priority: data.priority,
      notes: data.notes || null,
    },
  });
  if (result.count === 0) return { error: "Exam not found." };

  revalidatePath("/exams");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteExam(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();

  const result = await db.exam.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return { error: "Exam not found." };

  revalidatePath("/exams");
  revalidatePath("/dashboard");
  return { success: true };
}
