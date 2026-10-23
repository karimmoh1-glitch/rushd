"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import type { ClassInput } from "@/lib/validation/classes";
import { createCourse, setCourseArchived, updateCourse } from "@/lib/courses/service";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

export type ActionResult = { error: string } | { success: true };

export async function createClass(input: ClassInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await createCourse(user.id, input);
  if (!result.ok) return { error: result.error };

  await logEvent(user.id, "class_created", { classId: result.id });
  revalidatePath("/courses");
  return { success: true };
}

export async function updateClass(id: string, input: ClassInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await updateCourse(user.id, id, input);
  if (!result.ok) return { error: result.error };

  await regeneratePlanSnapshot(user.id, "course_changed");
  revalidatePath("/courses");
  return { success: true };
}

export async function setClassArchived(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await setCourseArchived(user.id, id, archived);
  if (!result.ok) return { error: result.error };

  await regeneratePlanSnapshot(user.id, "course_changed");
  revalidatePath("/courses");
  return { success: true };
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();

  const existingClass = await db.class.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      _count: { select: { assignments: true, exams: true } },
    },
  });
  if (!existingClass) return { error: "Class not found." };

  const hasWork = existingClass._count.assignments > 0 || existingClass._count.exams > 0;
  if (hasWork) {
    return {
      error:
        "This class has assignments or exams attached. Archive it instead of deleting, or remove those first.",
    };
  }

  await db.class.delete({ where: { id: existingClass.id } });
  revalidatePath("/courses");
  return { success: true };
}
