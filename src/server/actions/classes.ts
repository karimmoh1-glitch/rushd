"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { ClassSchema, type ClassInput } from "@/lib/validation/classes";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

export type ActionResult = { error: string } | { success: true };

export async function createClass(input: ClassInput): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = ClassSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const created = await db.class.create({
    data: { userId: user.id, ...parsed.data },
    select: { id: true },
  });

  await logEvent(user.id, "class_created", { classId: created.id });
  revalidatePath("/courses");
  return { success: true };
}

export async function updateClass(
  id: string,
  input: ClassInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const parsed = ClassSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Filtering by (id, userId) is the ownership check: someone else's class
  // matches zero rows.
  const result = await db.class.updateMany({
    where: { id, userId: user.id },
    data: parsed.data,
  });
  if (result.count === 0) return { error: "Class not found." };

  await regeneratePlanSnapshot(user.id);
  revalidatePath("/courses");
  return { success: true };
}

export async function setClassArchived(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();

  const result = await db.class.updateMany({
    where: { id, userId: user.id },
    data: { archived },
  });
  if (result.count === 0) return { error: "Class not found." };

  await regeneratePlanSnapshot(user.id);
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
