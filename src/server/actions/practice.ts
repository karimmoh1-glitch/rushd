"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { aiEnabled } from "@/lib/env";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";
import { anthropic } from "@/lib/ai/client";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { validateImageFiles } from "@/lib/upload/validate-image";
import { runAssessment } from "@/lib/practice/assessment";
import { getMastery } from "@/lib/practice/load";
import { recommendResources } from "@/lib/resources/recommend";
import { compactPreferences, readPreferences } from "@/lib/tutor/preferences";

export type PracticeResult =
  | { status: "ok"; id: string }
  | { status: "unreadable"; message: string }
  | { status: "error"; error: string };

const MAX_IMAGES = 2;
const Fields = z.object({
  text: z.string().trim().max(6000, "Keep typed work under 6,000 characters.").optional(),
  context: z.string().trim().max(200).optional(),
  classId: z.string().max(64).optional(),
});

/** One practice check. The photo is validated in memory, sent to the model,
 * and discarded; only the structured result and topic evidence are kept. */
export async function submitPracticeCheck(formData: FormData): Promise<PracticeResult> {
  const user = await requireUserOrThrow();
  if (!aiEnabled) return { status: "error", error: "Practice checks aren't available on this server yet." };

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const fields = Fields.safeParse({
    text: formData.get("text") || undefined,
    context: formData.get("context") || undefined,
    classId: formData.get("classId") || undefined,
  });
  if (!fields.success) return { status: "error", error: fields.error.issues[0]?.message ?? "Invalid input." };
  const { text, context, classId: rawClassId } = fields.data;
  if (files.length === 0 && (!text || text.length < 20)) {
    return { status: "error", error: "Add a photo of your work, or type at least a question and your answer." };
  }
  if (files.length > MAX_IMAGES) return { status: "error", error: `Up to ${MAX_IMAGES} photos per check.` };
  const validation = files.length ? await validateImageFiles(files) : { ok: true as const, images: [] };
  if (!validation.ok) return { status: "error", error: validation.error };

  const classId = rawClassId
    ? ((await db.class.findFirst({ where: { id: rawClassId, userId: user.id }, select: { id: true } }))?.id ?? null)
    : null;

  const reservation = await reserveAi(user.id, "photo_assessment");
  if (!reservation.ok) return { status: "error", error: reservation.message };
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { tutorInstructions: true, tutorPreferences: true } });

  try {
    const { reconciled, usage } = await runAssessment(
      anthropic(),
      {
        images: validation.images,
        text: text ?? null,
        context: context ?? null,
        preferences: compactPreferences(readPreferences(profile?.tutorPreferences), profile?.tutorInstructions),
      },
      AbortSignal.timeout(55_000),
    );
    if (!reconciled.ok) {
      // The provider was paid, but an unreadable check doesn't use up the
      // student's allowance (failed rows don't count toward it).
      await failAi(reservation.usageId, reconciled.reason, usage.model, usage);
      await logEvent(user.id, "assessment_unreadable", { reason: reconciled.reason });
      return { status: "unreadable", message: reconciled.message };
    }
    await settleAi(reservation.usageId, usage.model, usage);

    const { result } = reconciled;
    result.resources = await recommendResources(result.gaps.length ? result.gaps.map((g) => g.concept) : result.searchPhrases);
    const created = await db.assessment.create({
      data: {
        userId: user.id,
        classId,
        source: validation.images.length ? "photo" : "text",
        subject: result.subject,
        topic: result.topic,
        topicKey: reconciled.topicKey,
        itemsAssessed: result.gradable,
        estimateLow: result.low,
        estimateHigh: result.high,
        confidence: result.confidence,
        result: result as unknown as Prisma.InputJsonValue,
        evidence: {
          create: {
            userId: user.id,
            classId,
            topicKey: reconciled.topicKey,
            topicLabel: result.topic,
            score: reconciled.evidenceScore,
            weight: reconciled.evidenceWeight,
            source: "assessment",
          },
        },
      },
      select: { id: true },
    });
    await logEvent(user.id, "assessment_completed", { items: result.gradable, confidence: result.confidence, source: validation.images.length ? "photo" : "text" });
    revalidatePath("/practice");
    revalidatePath("/mastery");
    revalidatePath("/dashboard");
    return { status: "ok", id: created.id };
  } catch (error) {
    console.error("[practice] check failed", (error as Error)?.name ?? typeof error);
    await failAi(reservation.usageId, (error as Error)?.name ?? "error").catch(() => {});
    return { status: "error", error: "The check couldn't be completed right now. Try again shortly." };
  }
}

const Id = z.string().min(1).max(64);

/** Deletes a check and the evidence it contributed to mastery. */
export async function deleteAssessment(id: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUserOrThrow();
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { error: "Invalid check." };
  const deleted = await db.assessment.deleteMany({ where: { id: parsed.data, userId: user.id } });
  if (deleted.count === 0) return { error: "Check not found." };
  revalidatePath("/practice");
  revalidatePath("/mastery");
  return { success: true };
}

/** Turns a weak topic into a 30-minute review item the deterministic planner
 * schedules like any other work, due in three days. */
export async function scheduleTopicReview(topicKey: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUserOrThrow();
  const key = z.string().min(1).max(80).safeParse(topicKey);
  if (!key.success) return { error: "Invalid topic." };
  const topic = (await getMastery(user.id)).find((t) => t.topicKey === key.data);
  if (!topic) return { error: "Topic not found." };
  const cls =
    (topic.classId && (await db.class.findFirst({ where: { id: topic.classId, userId: user.id, archived: false }, select: { id: true } }))) ||
    (await db.class.findFirst({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!cls) return { error: "Add a course first so the review has somewhere to live." };
  const title = `Review: ${topic.topicLabel}`.slice(0, 200);
  const existing = await db.assignment.findFirst({ where: { userId: user.id, title, status: { not: "COMPLETED" } }, select: { id: true } });
  if (existing) return { error: "That review is already on your plan." };
  await db.assignment.create({
    data: {
      userId: user.id,
      classId: cls.id,
      title,
      dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      estimatedMinutes: 30,
      notes: `Added from your mastery results (${topic.estimate}% estimate, ${topic.confidence} confidence).`,
    },
  });
  await logEvent(user.id, "review_scheduled", {});
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  revalidatePath("/mastery");
  return { success: true };
}
