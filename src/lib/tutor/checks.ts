import "server-only";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/analytics/log-event";
import { recordAttempt, startSession, type AttemptResultValue } from "@/lib/learning/practice";
import type { MasteryStatusV2 } from "@/lib/learning/estimator";

// Check questions in a tutor conversation. A check is a question from the
// student's own practice bank, asked by the tutor. It becomes mastery
// evidence (through learning-core's recordAttempt, source "tutor") only when
// the student answers it in a LATER message and the answer is graded. Asking,
// hinting and chatting never record evidence. Every function takes the
// session's userId and re-checks ownership of every id.

export type CheckResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface PosedCheck {
  checkId: string;
  questionId: string;
  topicId: string | null;
  topicTitle: string | null;
  prompt: string;
  answer: string;
  explanation: string | null;
  hintsAvailable: number;
  origin: "STUDENT" | "AI_GENERATED";
  sourceNote: string | null;
  difficulty: number;
}

/** Picks a bank question for a topic (and its subtopics): never answered
 * first, then most recently missed, then the longest since a correct answer. */
async function pickQuestion(userId: string, classId: string, topicId: string): Promise<string | null> {
  const topics = await db.courseTopic.findMany({
    where: { userId, classId, status: "CONFIRMED", OR: [{ id: topicId }, { parentId: topicId }] },
    select: { id: true },
  });
  if (topics.length === 0) return null;
  const questions = await db.practiceQuestion.findMany({
    where: { userId, classId, hiddenAt: null, topicId: { in: topics.map((t) => t.id) } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true },
  });
  if (questions.length === 0) return null;
  const evidence = await db.masteryEvidence.findMany({
    where: { userId, questionId: { in: questions.map((q) => q.id) } },
    orderBy: { createdAt: "asc" },
    select: { questionId: true, result: true, createdAt: true },
  });
  const last = new Map<string, { result: string | null; at: number }>();
  for (const e of evidence) last.set(e.questionId!, { result: e.result, at: e.createdAt.getTime() });
  const rank = (id: string): [number, number] => {
    const l = last.get(id);
    if (!l) return [0, 0];
    if (l.result !== "CORRECT") return [1, -l.at];
    return [2, l.at];
  };
  const sorted = [...questions].sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    return ra[0] - rb[0] || ra[1] - rb[1];
  });
  return sorted[0].id;
}

/** Closes any check still open in the conversation, so only one can take an answer. */
async function retireOpenChecks(userId: string, conversationId: string, now: Date) {
  const open = await db.tutorCheck.findMany({ where: { userId, conversationId, answeredAt: null }, select: { sessionId: true } });
  if (open.length === 0) return;
  await db.practiceSession.updateMany({ where: { userId, id: { in: open.map((c) => c.sessionId) }, completedAt: null }, data: { completedAt: now } });
}

/** Opens a check: a one-question practice session in the conversation's course. */
export async function poseCheck(
  userId: string,
  options: { conversationId: string; classId: string; topicId?: string | null; questionId?: string | null; now: Date },
): Promise<CheckResult<{ check: PosedCheck }>> {
  const conversation = await db.tutorConversation.findFirst({
    where: { id: options.conversationId, userId, classId: options.classId },
    select: { id: true },
  });
  if (!conversation) return { ok: false, error: "This conversation isn't about that course." };

  let questionId: string | null = null;
  if (options.questionId) {
    const owned = await db.practiceQuestion.findFirst({
      where: { id: options.questionId, userId, classId: options.classId, hiddenAt: null },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "No question with that id in this course's practice bank." };
    questionId = owned.id;
  } else if (options.topicId) {
    const topic = await db.courseTopic.findFirst({ where: { id: options.topicId, userId, classId: options.classId, status: "CONFIRMED" }, select: { id: true } });
    if (!topic) return { ok: false, error: "No confirmed topic with that id in this course." };
    questionId = await pickQuestion(userId, options.classId, topic.id);
    if (!questionId) return { ok: false, error: "NO_BANK_QUESTIONS" };
  } else {
    return { ok: false, error: "Give a topic_id or a question_id." };
  }

  await retireOpenChecks(userId, conversation.id, options.now);
  const session = await startSession(userId, options.classId, { mode: "tutor", questionIds: [questionId] }, options.now);
  if (!session.ok) return { ok: false, error: session.error };
  const question = await db.practiceQuestion.findFirstOrThrow({
    where: { id: questionId, userId },
    select: { id: true, topicId: true, prompt: true, answer: true, explanation: true, hints: true, origin: true, sourceNote: true, difficulty: true, topic: { select: { title: true } } },
  });
  const check = await db.tutorCheck.create({
    data: { userId, conversationId: conversation.id, classId: options.classId, sessionId: session.id, questionId, topicId: question.topicId, posedAt: options.now },
    select: { id: true },
  });
  return {
    ok: true,
    check: {
      checkId: check.id,
      questionId,
      topicId: question.topicId,
      topicTitle: question.topic?.title ?? null,
      prompt: question.prompt,
      answer: question.answer,
      explanation: question.explanation,
      hintsAvailable: question.hints.length,
      origin: question.origin,
      sourceNote: question.sourceNote,
      difficulty: question.difficulty,
    },
  };
}

async function openCheck(userId: string, checkId: string, conversationId?: string) {
  return db.tutorCheck.findFirst({
    where: { id: checkId, userId, ...(conversationId ? { conversationId } : {}) },
    select: {
      id: true, conversationId: true, classId: true, sessionId: true, questionId: true, hintsUsed: true, posedAt: true, answeredAt: true,
      session: { select: { completedAt: true } },
      question: { select: { hints: true } },
    },
  });
}

/** The next stored hint for an open check. Counts toward the answer's hints,
 * which lowers the credit the answer earns (docs/MASTERY.md). */
export async function takeHint(
  userId: string,
  checkId: string,
  options: { conversationId?: string; via: "button" | "tutor" },
): Promise<CheckResult<{ n: number; hint: string | null; remaining: number }>> {
  const check = await openCheck(userId, checkId, options.conversationId);
  if (!check) return { ok: false, error: "Check not found." };
  if (check.answeredAt || check.session.completedAt) return { ok: false, error: "This question is already closed." };
  const n = Math.min(10, check.hintsUsed + 1);
  await db.tutorCheck.updateMany({ where: { id: check.id, userId, answeredAt: null }, data: { hintsUsed: n } });
  await logEvent(userId, "tutor_hint_requested", { hint: n, via: options.via });
  const hint = check.question.hints[n - 1] ?? null;
  return { ok: true, n, hint, remaining: Math.max(0, check.question.hints.length - n) };
}

/** Grades the student's answer to an open check and records it as evidence.
 * The answer is the student's own message, passed by the server, and the
 * check must have been asked before that message was sent. */
export async function gradeCheck(
  userId: string,
  checkId: string,
  options: { conversationId: string; result: AttemptResultValue; studentAnswer: string; turnStartedAt: Date; now: Date },
): Promise<CheckResult<{ topicId: string | null; topicTitle: string | null; hintsUsed: number; before: MasteryStatusV2 | null; after: MasteryStatusV2 | null; classId: string }>> {
  const check = await openCheck(userId, checkId, options.conversationId);
  if (!check) return { ok: false, error: "Check not found in this conversation." };
  if (check.answeredAt || check.session.completedAt) return { ok: false, error: "This question was already answered or closed." };
  if (check.posedAt.getTime() >= options.turnStartedAt.getTime()) {
    return { ok: false, error: "The student hasn't answered this question yet: it was asked in this same reply. Wait for their answer." };
  }
  const answer = options.studentAnswer.trim();
  if (!answer) return { ok: false, error: "There's no answer to grade." };

  const attempt = await recordAttempt(
    userId,
    check.sessionId,
    { questionId: check.questionId, result: options.result, hintsUsed: check.hintsUsed, answer, source: "tutor" },
    options.now,
  );
  if (!attempt.ok) return { ok: false, error: attempt.error };
  await db.tutorCheck.updateMany({ where: { id: check.id, userId }, data: { answeredAt: options.now, result: options.result } });
  await db.practiceSession.updateMany({ where: { id: check.sessionId, userId, completedAt: null }, data: { completedAt: options.now } });
  const topic = attempt.topicId ? await db.courseTopic.findFirst({ where: { id: attempt.topicId, userId }, select: { title: true } }) : null;
  return {
    ok: true,
    classId: check.classId,
    topicId: attempt.topicId,
    topicTitle: topic?.title ?? null,
    hintsUsed: check.hintsUsed,
    before: attempt.before,
    after: attempt.after,
  };
}
