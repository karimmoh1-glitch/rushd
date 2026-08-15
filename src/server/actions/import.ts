"use server";

import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { aiEnabled } from "@/lib/env";
import { aiProvider } from "@/lib/ai";
import type { ExtractedAssignment } from "@/lib/ai/provider";
import { validateImageFiles } from "@/lib/upload/validate-image";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { assertOwnsClass } from "@/server/actions/class-ownership";

export type ExtractResult =
  | { status: "ok"; assignments: ExtractedAssignment[] }
  | { status: "unavailable" } // AI not configured or the call failed — manual entry is the path forward
  | { status: "error"; error: string }; // bad input (file type/size), not an AI failure

/**
 * Extracts assignments from uploaded screenshots. Never persists the
 * images — validated in memory, sent to the AI provider, discarded. See
 * docs/AI_ARCHITECTURE.md and docs/PRIVACY.md.
 */
export async function extractFromScreenshots(formData: FormData): Promise<ExtractResult> {
  const user = await requireUserOrThrow();

  const files = formData.getAll("images").filter((f): f is File => f instanceof File);
  const validation = await validateImageFiles(files);
  if (!validation.ok) {
    return { status: "error", error: validation.error };
  }

  if (!aiEnabled) {
    return { status: "unavailable" };
  }

  const classes = await db.class.findMany({
    where: { userId: user.id, archived: false },
    select: { id: true, name: true },
  });

  const result = await aiProvider.parseAssignmentImages(
    validation.images,
    classes,
    new Date(),
  );

  if (!result) return { status: "unavailable" };

  await logEvent(user.id, "assignment_imported", { count: result.length });
  return { status: "ok", assignments: result };
}

export interface ImportItem {
  kind: "assignment" | "exam";
  title: string;
  classId: string;
  dueAt: string; // ISO
  minutes: number;
}

export type CommitResult = { error: string } | { success: true; created: number };

/**
 * Bulk-creates the assignments/exams the student confirmed on the review
 * screen. Every classId is re-verified against the actual owner here —
 * the same rule as every other mutation, regardless of where the data
 * (AI-extracted, in this case) originated. See docs/SECURITY.md.
 */
export async function commitImportedAssignments(items: ImportItem[]): Promise<CommitResult> {
  const user = await requireUserOrThrow();

  if (items.length === 0) return { error: "Nothing to add." };
  if (items.length > 40) return { error: "Too many items at once." };

  const classIds = [...new Set(items.map((i) => i.classId))];
  for (const classId of classIds) {
    if (!(await assertOwnsClass(user.id, classId))) {
      return { error: "One of the selected classes wasn't found." };
    }
  }

  const assignmentItems = items.filter((i) => i.kind === "assignment");
  const examItems = items.filter((i) => i.kind === "exam");

  await db.$transaction([
    ...(assignmentItems.length > 0
      ? [
          db.assignment.createMany({
            data: assignmentItems.map((i) => ({
              userId: user.id,
              classId: i.classId,
              title: i.title,
              dueAt: new Date(i.dueAt),
              estimatedMinutes: i.minutes,
            })),
          }),
        ]
      : []),
    ...(examItems.length > 0
      ? [
          db.exam.createMany({
            data: examItems.map((i) => ({
              userId: user.id,
              classId: i.classId,
              title: i.title,
              examAt: new Date(i.dueAt),
              prepMinutes: i.minutes,
            })),
          }),
        ]
      : []),
  ]);

  await logEvent(user.id, "assignment_confirmed", { count: items.length });
  await regeneratePlanSnapshot(user.id);

  return { success: true, created: items.length };
}
