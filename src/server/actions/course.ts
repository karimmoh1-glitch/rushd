"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { aiEnabled } from "@/lib/env";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { anthropic } from "@/lib/ai/client";
import { syncCourseContent, type ContentSyncSummary } from "@/lib/canvas/content-sync";
import { getAssignmentMaterial } from "@/lib/course/retrieval";
import { MAX_DRAFT_CHARS, MIN_DRAFT_CHARS, reviewDraft } from "@/lib/review/draft-review";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { compactPreferences, readPreferences } from "@/lib/tutor/preferences";
import { log } from "@/lib/log";

type SimpleResult = { success: true } | { error: string };
type ValueResult<T> = { success: true; value: T } | { error: string };

const Id = z.string().min(1).max(64);

export async function syncCourseContentAction(classId: string): Promise<ValueResult<ContentSyncSummary>> {
  const user = await requireUserOrThrow();
  const id = Id.safeParse(classId);
  if (!id.success) return { error: "Invalid class." };
  const rate = await checkRateLimit(`content-sync:${user.id}`, { max: 10 });
  if (!rate.allowed) return { error: "Syncing too often. Try again in a few minutes." };
  const result = await syncCourseContent(user.id, id.data);
  if (!result.ok) return { error: result.error };
  await logEvent(user.id, "course_content_synced", { ...result.value, notes: result.value.notes.length });
  revalidatePath(`/courses/${id.data}`);
  return { success: true, value: result.value };
}

const ReviewInput = z.object({
  assignmentId: Id,
  draft: z
    .string()
    .trim()
    .min(MIN_DRAFT_CHARS, `Paste at least ${MIN_DRAFT_CHARS} characters of your draft.`)
    .max(MAX_DRAFT_CHARS, `Drafts are limited to ${MAX_DRAFT_CHARS.toLocaleString()} characters; review one section at a time.`),
  label: z.string().trim().max(60).optional(),
});

export async function createDraftReview(input: z.input<typeof ReviewInput>): Promise<ValueResult<{ id: string }>> {
  const user = await requireUserOrThrow();
  if (!aiEnabled) return { error: "Draft review isn't available on this server yet." };
  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const assignment = await db.assignment.findFirst({
    where: { id: parsed.data.assignmentId, userId: user.id },
    select: { id: true, title: true },
  });
  if (!assignment) return { error: "Assignment not found." };
  const material = await getAssignmentMaterial(user.id, assignment.id);
  if (!material?.rubric) {
    return { error: "This assignment has no rubric from Canvas, so Rushd can't score against one. It won't invent criteria." };
  }

  const reservation = await reserveAi(user.id, "draft_review");
  if (!reservation.ok) return { error: reservation.message };
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { tutorInstructions: true, tutorPreferences: true } });

  try {
    const outcome = await reviewDraft(anthropic(), {
      title: assignment.title,
      description: material.body,
      rubric: material.rubric,
      draft: parsed.data.draft,
      preferences: compactPreferences(readPreferences(profile?.tutorPreferences), profile?.tutorInstructions),
    });
    if (!outcome.ok) {
      await failAi(reservation.usageId, "incomplete", outcome.usage.model, outcome.usage);
      return { error: outcome.error };
    }
    await settleAi(reservation.usageId, outcome.usage.model, outcome.usage);

    // Without a label, number the drafts: "Draft 1", "Draft 2", ...
    let label = parsed.data.label;
    if (!label) {
      const earlierReviews = await db.draftReview.count({ where: { userId: user.id, assignmentId: assignment.id } });
      label = `Draft ${earlierReviews + 1}`;
    }
    const saved = await db.draftReview.create({
      data: {
        userId: user.id,
        assignmentId: assignment.id,
        label,
        draftText: parsed.data.draft,
        result: outcome.result as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await logEvent(user.id, "draft_reviewed", { criteria: outcome.result.criteria.length, droppedQuotes: outcome.result.droppedQuotes });
    revalidatePath(`/assignments/${assignment.id}`);
    return { success: true, value: { id: saved.id } };
  } catch (error) {
    log.error("review.failed", { err: error });
    await failAi(reservation.usageId, (error as Error)?.name ?? "error").catch(() => {});
    return { error: "The review couldn't be completed right now. Try again shortly." };
  }
}

export async function deleteDraftReview(id: string): Promise<SimpleResult> {
  const user = await requireUserOrThrow();
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { error: "Invalid review." };
  const deleted = await db.draftReview.deleteMany({ where: { id: parsed.data, userId: user.id } });
  if (deleted.count === 0) return { error: "Review not found." };
  revalidatePath("/assignments", "layout");
  return { success: true };
}

export async function deleteTutorConversation(id: string): Promise<SimpleResult> {
  const user = await requireUserOrThrow();
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { error: "Invalid conversation." };
  const deleted = await db.tutorConversation.deleteMany({ where: { id: parsed.data, userId: user.id } });
  if (deleted.count === 0) return { error: "Conversation not found." };
  revalidatePath("/tutor", "layout");
  return { success: true };
}

export async function deleteAllTutorConversations(): Promise<SimpleResult> {
  const user = await requireUserOrThrow();
  await db.tutorConversation.deleteMany({ where: { userId: user.id } });
  revalidatePath("/tutor", "layout");
  return { success: true };
}
