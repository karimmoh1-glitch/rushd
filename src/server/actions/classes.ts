"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { ClassSchema, type ClassInput } from "@/lib/validation/classes";
import { logEvent } from "@/lib/analytics/log-event";

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
  revalidatePath("/classes");
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

  // updateMany scoped to (id, userId) makes ownership the query condition
  // itself rather than a separate check — a class owned by someone else
  // simply matches zero rows.
  const result = await db.class.updateMany({
    where: { id, userId: user.id },
    data: parsed.data,
  });
  if (result.count === 0) return { error: "Class not found." };

  revalidatePath("/classes");
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

  revalidatePath("/classes");
  return { success: true };
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();

  const cls = await db.class.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      _count: { select: { assignments: true, exams: true } },
    },
  });
  if (!cls) return { error: "Class not found." };

  if (cls._count.assignments > 0 || cls._count.exams > 0) {
    return {
      error:
        "This class has assignments or exams attached. Archive it instead of deleting, or remove those first.",
    };
  }

  await db.class.delete({ where: { id: cls.id } });
  revalidatePath("/classes");
  return { success: true };
}
