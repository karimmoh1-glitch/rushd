import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { logEvent } from "@/lib/analytics/log-event";
import { getCourseLearning } from "@/lib/learning/load";
import { generateQuestions, type GenerationProvider } from "@/lib/learning/practice";
import { PLANNING_HORIZON_DAYS } from "@/lib/planning/constants";
import { localDateKey } from "@/lib/time/zone";
import { buildRevisionPlan, type RevisionPlan } from "./revision";
import { readCards, type TutorCard } from "./cards";

// The tutor proposes; the student confirms. Revision plans become planner
// blocks and practice offers become generated questions only through these
// functions, called from the student's own click (src/server/actions/tutor.ts).

/** A revision plan for the course's next exam (or the one given), from the course's own topics and mastery. */
export async function planRevision(
  userId: string,
  options: { classId: string; examId?: string | null; now: Date; timeZone: string },
): Promise<RevisionPlan | { error: string }> {
  const exam = await db.exam.findFirst({
    where: options.examId
      ? { id: options.examId, userId, classId: options.classId }
      : { userId, classId: options.classId, examAt: { gte: options.now } },
    orderBy: { examAt: "asc" },
    select: { id: true, title: true, examAt: true },
  });
  if (!exam) {
    return { error: options.examId ? "No exam with that id in this course." : "NO_EXAM" };
  }
  const today = localDateKey(options.now, options.timeZone);
  const [learning, availability, busy] = await Promise.all([
    getCourseLearning(userId, options.classId, options.now),
    db.studyAvailability.findMany({ where: { userId }, select: { dayOfWeek: true, startMinute: true, endMinute: true } }),
    db.scheduleBlock.findMany({ where: { userId, localDate: { gte: today } }, select: { localDate: true, startMinute: true, durationMinutes: true } }),
  ]);
  return buildRevisionPlan({
    exam: { id: exam.id, title: exam.title, at: exam.examAt },
    now: options.now,
    timeZone: options.timeZone,
    topics: (learning?.topics ?? []).map((t) => ({ id: t.id, title: t.title, status: t.estimate.status, estimate: t.estimate.estimate, due: t.estimate.due })),
    availability,
    busy,
    horizonDays: PLANNING_HORIZON_DAYS,
  });
}

async function loadCards(userId: string, conversationId: string, messageId: string) {
  const message = await db.tutorMessage.findFirst({
    where: { id: messageId, conversationId, role: "assistant", conversation: { userId } },
    select: { id: true, cards: true },
  });
  if (!message) return null;
  return { id: message.id, cards: readCards(message.cards) };
}

async function saveCards(messageId: string, cards: TutorCard[]) {
  await db.tutorMessage.update({ where: { id: messageId }, data: { cards: cards as unknown as Prisma.InputJsonValue } });
}

export type PinBlock = (block: { kind: "exam"; itemId: string; date: string; startMinute: number; durationMinutes: number }) => Promise<{ error: string } | { success: true }>;

/** Adds a confirmed revision plan's sessions to the planner, through the planner's own pin action. */
export async function acceptRevisionPlan(
  userId: string,
  input: { conversationId: string; messageId: string },
  pin: PinBlock,
): Promise<{ ok: true; added: number; skipped: number; errors: string[] } | { ok: false; error: string }> {
  const loaded = await loadCards(userId, input.conversationId, input.messageId);
  if (!loaded) return { ok: false, error: "That plan isn't available." };
  const index = loaded.cards.findIndex((c) => c.type === "revision_plan");
  const card = loaded.cards[index];
  if (!card || card.type !== "revision_plan") return { ok: false, error: "That plan isn't available." };
  if (card.accepted) return { ok: false, error: "These sessions are already on your plan." };
  // The exam must still be the student's own.
  const exam = await db.exam.findFirst({ where: { id: card.examId, userId, classId: card.classId }, select: { id: true } });
  if (!exam) return { ok: false, error: "That exam no longer exists." };

  let added = 0;
  const errors: string[] = [];
  for (const session of card.sessions) {
    const result = await pin({ kind: "exam", itemId: exam.id, date: session.date, startMinute: session.startMinute, durationMinutes: session.minutes });
    if ("error" in result) errors.push(result.error);
    else added += 1;
  }
  const skipped = card.sessions.length - added;
  loaded.cards[index] = { ...card, accepted: { added, skipped } };
  await saveCards(loaded.id, loaded.cards);
  await logEvent(userId, "tutor_revision_blocks_added", { added, skipped });
  return { ok: true, added, skipped, errors: [...new Set(errors)] };
}

/** Generates the practice the tutor offered, through learning-core's generator
 * (AI-generated, unverified, in the course's practice bank). */
export async function acceptPracticeOffer(
  userId: string,
  input: { conversationId: string; messageId: string },
  deps: { provider?: GenerationProvider; available?: boolean } = {},
): Promise<{ ok: true; generated: number; classId: string } | { ok: false; error: string }> {
  const loaded = await loadCards(userId, input.conversationId, input.messageId);
  if (!loaded) return { ok: false, error: "That offer isn't available." };
  const index = loaded.cards.findIndex((c) => c.type === "practice_offer");
  const card = loaded.cards[index];
  if (!card || card.type !== "practice_offer") return { ok: false, error: "That offer isn't available." };
  if (card.generated !== null) return { ok: false, error: "Those questions were already generated." };
  const result = await generateQuestions(userId, card.classId, card.topicId, { ...deps, count: card.count });
  if (!result.ok) return { ok: false, error: result.error };
  loaded.cards[index] = { ...card, generated: result.ids.length };
  await saveCards(loaded.id, loaded.cards);
  await logEvent(userId, "tutor_practice_generated", { count: result.ids.length });
  return { ok: true, generated: result.ids.length, classId: card.classId };
}
