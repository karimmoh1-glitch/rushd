"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import type { AssignmentInput } from "@/lib/validation/assignments";
import { IdSchema } from "@/lib/validation/import";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import {
  createAssignmentForUser,
  setAssignmentStatusForUser,
  updateAssignmentForUser,
} from "@/lib/assignments/service";

// The create/edit/status logic lives in src/lib/assignments/service.ts, shared
// with the native app's API. These actions add the cookie session and revalidation.

export type ActionResult = { error: string } | { success: true };

function revalidateAssignmentPages() {
  revalidatePath("/assignments");
  revalidatePath("/dashboard");
}

export async function createAssignment(
  input: AssignmentInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await createAssignmentForUser(user.id, input);
  if ("error" in result) return result;
  revalidateAssignmentPages();
  return { success: true };
}

export async function updateAssignment(
  id: string,
  input: AssignmentInput,
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await updateAssignmentForUser(user.id, id, input);
  if ("error" in result) return result;
  revalidateAssignmentPages();
  revalidatePath("/plan");
  return { success: true };
}

export async function setAssignmentStatus(
  id: string,
  status: AssignmentInput["status"],
): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  const result = await setAssignmentStatusForUser(user.id, id, status);
  if ("error" in result) return result;
  revalidateAssignmentPages();
  revalidatePath("/plan");
  return { success: true };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  const user = await requireUserOrThrow();
  if (!IdSchema.safeParse(id).success) return { error: "Assignment not found." };

  const result = await db.assignment.deleteMany({
    where: { id, userId: user.id },
  });
  if (result.count === 0) return { error: "Assignment not found." };

  await regeneratePlanSnapshot(user.id);
  revalidateAssignmentPages();
  return { success: true };
}
