"use server";

import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { aiEnabled } from "@/lib/env";
import { aiProvider, type CallUsage } from "@/lib/ai";
import type { ExtractedAssignment } from "@/lib/ai/provider";
import { validateImageFiles } from "@/lib/upload/validate-image";
import type { Prisma } from "@/generated/prisma/client";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { assertOwnsClass } from "@/server/actions/class-ownership";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { ImportItemsSchema } from "@/lib/validation/import";

export type ExtractResult =
  | { status: "ok"; assignments: ExtractedAssignment[] }
  | { status: "unavailable" } // AI not configured or the call failed — manual entry is the path forward
  | { status: "error"; error: string }; // bad input (file type/size), not an AI failure

/** Extracts assignments from uploaded screenshots. The images are never saved:
 * checked in memory, sent to the AI, then dropped (see docs/PRIVACY.md). */
export async function extractFromScreenshots(formData: FormData): Promise<ExtractResult> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`import-extract:${user.id}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return { status: "error", error: "That's a lot of screenshots this hour. Try again in a bit." };

  const files: File[] = [];
  for (const entry of formData.getAll("images")) {
    if (entry instanceof File) {
      files.push(entry);
    }
  }
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

  const reservation = await reserveAi(user.id, "screenshot_import");
  if (!reservation.ok) {
    return { status: "error", error: reservation.message };
  }

  // The provider reports token usage through this callback, if it answered at all.
  let usage: CallUsage | undefined;
  const result = await aiProvider.parseAssignmentImages(validation.images, classes, new Date(), (callUsage) => {
    usage = callUsage;
  });
  if (usage) {
    await settleAi(reservation.usageId, usage.model, usage);
  } else {
    await failAi(reservation.usageId, "no_response");
  }

  if (!result) {
    return { status: "unavailable" };
  }

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

/** Saves the assignments and exams the student confirmed on the review screen.
 * Every classId is re-checked against the owner, even though it came from us. */
export async function commitImportedAssignments(input: ImportItem[]): Promise<CommitResult> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`import-commit:${user.id}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return { error: "That's a lot of importing at once. Try again in a bit." };

  const parsed = ImportItemsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some items couldn't be read." };
  const items = parsed.data;

  // Check each distinct class once.
  const classIds = new Set<string>();
  for (const item of items) {
    classIds.add(item.classId);
  }
  for (const classId of classIds) {
    if (!(await assertOwnsClass(user.id, classId))) {
      return { error: "One of the selected classes wasn't found." };
    }
  }

  const assignmentRows: Prisma.AssignmentCreateManyInput[] = [];
  const examRows: Prisma.ExamCreateManyInput[] = [];
  for (const item of items) {
    if (item.kind === "assignment") {
      assignmentRows.push({
        userId: user.id,
        classId: item.classId,
        title: item.title,
        dueAt: new Date(item.dueAt),
        estimatedMinutes: item.minutes,
      });
    } else if (item.kind === "exam") {
      examRows.push({
        userId: user.id,
        classId: item.classId,
        title: item.title,
        examAt: new Date(item.dueAt),
        prepMinutes: item.minutes,
      });
    }
  }

  // Only include the inserts that have rows, and run them together.
  const inserts: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];
  if (assignmentRows.length > 0) {
    inserts.push(db.assignment.createMany({ data: assignmentRows }));
  }
  if (examRows.length > 0) {
    inserts.push(db.exam.createMany({ data: examRows }));
  }
  await db.$transaction(inserts);

  await logEvent(user.id, "assignment_confirmed", { count: items.length });
  await regeneratePlanSnapshot(user.id);

  return { success: true, created: items.length };
}
