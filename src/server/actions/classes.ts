"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { IdSchema } from "@/lib/validation/import";
import type { ClassInput } from "@/lib/validation/classes";
import { createCourse, createCourses, setCourseArchived, updateCourse } from "@/lib/courses/service";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

export type ActionResult = { error: string } | { success: true };

export async function createClass(input: ClassInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await createCourse(user.id, input);
  if (!result.ok) return { error: result.error };

  await logEvent(user.id, "class_created", { classId: result.id });
  // Catalog id or "custom" only, never the name the student typed.
  await logEvent(user.id, "course_added", { catalogId: input.catalogId || null, custom: !input.catalogId, level: input.level ?? null, via: "courses" });
  revalidatePath("/courses");
  return { success: true };
}

/** Adds several courses picked at once in the Courses page picker. */
export async function createClasses(inputs: ClassInput[]): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  if (!Array.isArray(inputs)) return { error: "Invalid input." };
  const result = await createCourses(user.id, inputs);
  if (!result.ok) return { error: result.error };

  for (const [index, id] of result.ids.entries()) {
    const input = inputs[index];
    await logEvent(user.id, "class_created", { classId: id });
    await logEvent(user.id, "course_added", { catalogId: input.catalogId || null, custom: !input.catalogId, level: input.level ?? null, via: "courses_multi" });
  }
  await regeneratePlanSnapshot(user.id);
  revalidatePath("/courses");
  return { success: true };
}

export async function updateClass(id: string, input: ClassInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  if (!IdSchema.safeParse(id).success) return { error: "Class not found." };
  const result = await updateCourse(user.id, id, input);
  if (!result.ok) return { error: result.error };

  await regeneratePlanSnapshot(user.id);
  revalidatePath("/courses");
  return { success: true };
}

export async function setClassArchived(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  if (!IdSchema.safeParse(id).success) return { error: "Class not found." };
  const result = await setCourseArchived(user.id, id, archived === true);
  if (!result.ok) return { error: result.error };

  await regeneratePlanSnapshot(user.id);
  revalidatePath("/courses");
  return { success: true };
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  if (!IdSchema.safeParse(id).success) return { error: "Class not found." };

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
