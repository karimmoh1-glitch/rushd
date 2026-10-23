import "server-only";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { logEvent } from "@/lib/analytics/log-event";
import { aiProvider, type AIProvider, type CallUsage } from "@/lib/ai";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { searchMaterials } from "@/lib/course/retrieval";
import { levelLabel } from "@/lib/courses/catalog";
import { topicKey } from "@/lib/practice/mastery";
import { estimateTopic, type MasteryStatusV2 } from "./estimator";
import { toObservation } from "./observations";
import { subjectProfile } from "./subjects";

// Practice questions, sessions and attempts. Works without AI: students write
// their own questions; generation is an optional extra. Every function takes
// the signed-in student's userId and scopes every query by it.

export type PracticeResult<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string };

export type AttemptResultValue = "CORRECT" | "PARTIAL" | "INCORRECT";
export type SessionMode = "practice" | "review" | "mistakes";

export const SESSION_SIZE = 8;
const MAX_QUESTIONS_PER_COURSE = 500;
const RESULT_SCORE: Record<AttemptResultValue, number> = { CORRECT: 1, PARTIAL: 0.5, INCORRECT: 0 };

export interface QuestionInput {
  topicId?: string | null;
  prompt: string;
  answer: string;
  explanation?: string | null;
  hints?: string[];
  difficulty?: number;
}

function clip(text: string | null | undefined, max: number): string | null {
  const trimmed = (text ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

async function ownedTopicIn(userId: string, classId: string, topicId: string | null | undefined) {
  if (!topicId) return null;
  return db.courseTopic.findFirst({ where: { id: topicId, userId, classId, status: "CONFIRMED" }, select: { id: true, key: true, title: true } });
}

/** A question the student writes ("your question"). */
export async function createQuestion(userId: string, classId: string, input: QuestionInput): Promise<PracticeResult> {
  const course = await db.class.findFirst({ where: { id: classId, userId }, select: { id: true, name: true, subject: true } });
  if (!course) return { ok: false, error: "Course not found." };
  const prompt = clip(input.prompt, 2000);
  const answer = clip(input.answer, 3000);
  if (!prompt || !answer) return { ok: false, error: "Add both the question and its answer." };
  let topicId: string | null = null;
  if (input.topicId) {
    const topic = await ownedTopicIn(userId, classId, input.topicId);
    if (!topic) return { ok: false, error: "Topic not found." };
    topicId = topic.id;
  }
  const count = await db.practiceQuestion.count({ where: { userId, classId } });
  if (count >= MAX_QUESTIONS_PER_COURSE) return { ok: false, error: `A course can have up to ${MAX_QUESTIONS_PER_COURSE} questions.` };
  const hints = (input.hints ?? []).map((h) => h.trim().slice(0, 300)).filter(Boolean).slice(0, 3);
  const created = await db.practiceQuestion.create({
    data: {
      userId,
      classId,
      topicId,
      origin: "STUDENT",
      format: subjectProfile(course).format,
      prompt,
      answer,
      explanation: clip(input.explanation, 2000),
      hints,
      difficulty: Math.max(1, Math.min(3, Math.round(input.difficulty ?? 2))),
    },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

/** Removes a question from practice. It's hidden, not deleted, so the
 * student's history of answering it stays intact. */
export async function removeQuestion(userId: string, questionId: string): Promise<PracticeResult> {
  const result = await db.practiceQuestion.updateMany({ where: { id: questionId, userId, hiddenAt: null }, data: { hiddenAt: new Date() } });
  if (result.count === 0) return { ok: false, error: "Question not found." };
  return { ok: true, id: questionId };
}

export const REPORT_REASONS = ["wrong_answer", "unclear", "off_topic", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** "Report a problem": records the report and hides the question for this student. */
export async function reportQuestion(userId: string, questionId: string, reason: ReportReason, note?: string | null): Promise<PracticeResult> {
  const question = await db.practiceQuestion.findFirst({ where: { id: questionId, userId }, select: { id: true } });
  if (!question) return { ok: false, error: "Question not found." };
  await db.$transaction([
    db.questionReport.create({ data: { userId, questionId, reason, note: clip(note, 1000) } }),
    db.practiceQuestion.updateMany({ where: { id: questionId, userId }, data: { hiddenAt: new Date() } }),
  ]);
  await logEvent(userId, "question_reported", { reason });
  return { ok: true, id: questionId };
}

/** Evidence rows for one topic, as estimator observations. */
async function topicObservations(userId: string, topic: { id: string }) {
  const rows = await db.masteryEvidence.findMany({
    where: { userId, topicId: topic.id },
    orderBy: { createdAt: "asc" },
    take: 2000,
    select: {
      id: true, createdAt: true, score: true, weight: true, assessmentId: true, sessionId: true,
      questionId: true, result: true, difficulty: true, hintsUsed: true, confidence: true,
    },
  });
  return rows.map(toObservation);
}

export interface SessionQuestion {
  id: string;
  topicId: string | null;
  topicTitle: string | null;
  origin: "STUDENT" | "AI_GENERATED";
  prompt: string;
  answer: string;
  explanation: string | null;
  hints: string[];
  difficulty: number;
  sourceNote: string | null;
}

/** Picks questions for a session, in a fixed order: due topics first, then
 * questions never answered, then ones missed most recently, then the rest. */
async function pickQuestions(
  userId: string,
  classId: string,
  options: { topicId?: string | null; mode: SessionMode; questionIds?: string[] },
  now: Date,
): Promise<string[]> {
  if (options.mode === "mistakes") {
    let ids = options.questionIds ?? [];
    if (ids.length === 0) {
      const misses = await db.masteryEvidence.findMany({
        where: { userId, classId, result: { in: ["INCORRECT", "PARTIAL"] }, questionId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { questionId: true },
      });
      ids = [...new Set(misses.map((m) => m.questionId!))];
    }
    const owned = await db.practiceQuestion.findMany({
      where: { id: { in: ids.slice(0, 50) }, userId, classId, hiddenAt: null },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((q) => q.id));
    return ids.filter((id) => ownedIds.has(id)).slice(0, SESSION_SIZE);
  }

  let topicFilter: string[] | null = null;
  if (options.topicId) {
    // A topic's session includes its subtopics.
    const topics = await db.courseTopic.findMany({
      where: { userId, classId, status: "CONFIRMED", OR: [{ id: options.topicId }, { parentId: options.topicId }] },
      select: { id: true },
    });
    topicFilter = topics.map((t) => t.id);
  }
  const questions = await db.practiceQuestion.findMany({
    where: { userId, classId, hiddenAt: null, ...(topicFilter ? { topicId: { in: topicFilter } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, topicId: true, createdAt: true },
  });
  if (questions.length === 0) return [];
  const evidence = await db.masteryEvidence.findMany({
    where: { userId, questionId: { in: questions.map((q) => q.id) } },
    orderBy: { createdAt: "asc" },
    select: { questionId: true, result: true, createdAt: true },
  });
  const lastByQuestion = new Map<string, { result: string | null; at: Date }>();
  for (const e of evidence) lastByQuestion.set(e.questionId!, { result: e.result, at: e.createdAt });

  // Which topics are due right now.
  const topicIds = [...new Set(questions.map((q) => q.topicId).filter((id): id is string => Boolean(id)))];
  const due = new Set<string>();
  for (const id of topicIds) {
    const estimate = estimateTopic(await topicObservations(userId, { id }), now);
    if (estimate.due) due.add(id);
  }

  function rank(q: (typeof questions)[number]): number[] {
    const last = lastByQuestion.get(q.id);
    const isDue = q.topicId && due.has(q.topicId) ? 0 : 1;
    if (!last) return [isDue, 0, 0];
    if (last.result !== "CORRECT") return [isDue, 1, -last.at.getTime()];
    return [isDue, 2, last.at.getTime()];
  }
  const sorted = [...questions].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted.slice(0, SESSION_SIZE).map((q) => q.id);
}

/** Starts a session. Returns its id, or an error when there's nothing to practice. */
export async function startSession(
  userId: string,
  classId: string,
  options: { topicId?: string | null; mode?: SessionMode; questionIds?: string[] } = {},
  now: Date = new Date(),
): Promise<PracticeResult<{ id: string; questions: number }>> {
  const course = await db.class.findFirst({ where: { id: classId, userId }, select: { id: true } });
  if (!course) return { ok: false, error: "Course not found." };
  const mode = options.mode ?? "practice";
  let topicId: string | null = null;
  if (options.topicId) {
    const topic = await ownedTopicIn(userId, classId, options.topicId);
    if (!topic) return { ok: false, error: "Topic not found." };
    topicId = topic.id;
  }
  const questionIds = await pickQuestions(userId, classId, { topicId, mode, questionIds: options.questionIds }, now);
  if (questionIds.length === 0) {
    return { ok: false, error: mode === "mistakes" ? "No missed questions to retry." : "Add a question first: there's nothing to practice yet." };
  }
  const session = await db.practiceSession.create({
    data: { userId, classId, topicId, mode, questionIds, startedAt: now },
    select: { id: true },
  });
  await logEvent(userId, "practice_session_started", { questions: questionIds.length, mode });
  return { ok: true, id: session.id, questions: questionIds.length };
}

export interface SessionView {
  id: string;
  classId: string;
  mode: SessionMode;
  completed: boolean;
  questions: SessionQuestion[];
  /** Question ids already answered in this session. */
  answered: string[];
}

export async function getSession(userId: string, sessionId: string): Promise<SessionView | null> {
  const session = await db.practiceSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, classId: true, mode: true, questionIds: true, completedAt: true, evidence: { select: { questionId: true } } },
  });
  if (!session) return null;
  const questions = await db.practiceQuestion.findMany({
    where: { id: { in: session.questionIds }, userId },
    select: {
      id: true, topicId: true, origin: true, prompt: true, answer: true, explanation: true, hints: true,
      difficulty: true, sourceNote: true, hiddenAt: true, topic: { select: { title: true } },
    },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answered = session.evidence.map((e) => e.questionId).filter((id): id is string => Boolean(id));
  return {
    id: session.id,
    classId: session.classId,
    mode: session.mode as SessionMode,
    completed: Boolean(session.completedAt),
    answered,
    questions: session.questionIds
      .map((id) => byId.get(id))
      // A question reported mid-session drops out unless it was already answered.
      .filter((q): q is NonNullable<typeof q> => Boolean(q) && (!q!.hiddenAt || answered.includes(q!.id)))
      .map((q) => ({
        id: q.id,
        topicId: q.topicId,
        topicTitle: q.topic?.title ?? null,
        origin: q.origin,
        prompt: q.prompt,
        answer: q.answer,
        explanation: q.explanation,
        hints: q.hints,
        difficulty: q.difficulty,
        sourceNote: q.sourceNote,
      })),
  };
}

export interface AttemptInput {
  questionId: string;
  result: AttemptResultValue;
  hintsUsed: number;
  confidence?: number | null;
  timeTakenSec?: number | null;
  answer?: string | null;
}

/** Records one answer as evidence. Returns the topic's status before and after. */
export async function recordAttempt(
  userId: string,
  sessionId: string,
  input: AttemptInput,
  now: Date = new Date(),
): Promise<PracticeResult<{ id: string; topicId: string | null; before: MasteryStatusV2 | null; after: MasteryStatusV2 | null }>> {
  const session = await db.practiceSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, classId: true, questionIds: true, completedAt: true, class: { select: { name: true } } },
  });
  if (!session) return { ok: false, error: "Session not found." };
  if (session.completedAt) return { ok: false, error: "This session is already finished." };
  if (!session.questionIds.includes(input.questionId)) return { ok: false, error: "That question isn't part of this session." };
  const question = await db.practiceQuestion.findFirst({
    where: { id: input.questionId, userId, classId: session.classId },
    select: { id: true, difficulty: true, topic: { select: { id: true, key: true, title: true, status: true } } },
  });
  if (!question) return { ok: false, error: "Question not found." };
  const already = await db.masteryEvidence.findFirst({ where: { userId, sessionId, questionId: question.id }, select: { id: true } });
  if (already) return { ok: false, error: "You've already answered this one in this session." };

  const topic = question.topic?.status === "CONFIRMED" ? question.topic : null;
  let before: MasteryStatusV2 | null = null;
  let isReview = false;
  if (topic) {
    const estimate = estimateTopic(await topicObservations(userId, topic), now);
    before = estimate.status;
    isReview = estimate.due;
  }
  const confidence = input.confidence == null ? null : Math.max(1, Math.min(3, Math.round(input.confidence)));
  const created = await db.masteryEvidence.create({
    data: {
      userId,
      classId: session.classId,
      topicId: topic?.id ?? null,
      // Untopiced practice still counts, under the course's own label.
      topicKey: topic?.key ?? topicKey(`${session.class.name} general`),
      topicLabel: topic?.title ?? `${session.class.name} (no topic)`,
      score: RESULT_SCORE[input.result],
      weight: 1,
      source: "practice",
      sessionId: session.id,
      questionId: question.id,
      result: input.result,
      difficulty: question.difficulty,
      hintsUsed: Math.max(0, Math.min(10, Math.round(input.hintsUsed))),
      confidence,
      timeTakenSec: input.timeTakenSec == null ? null : Math.max(0, Math.min(3600, Math.round(input.timeTakenSec))),
      isReview,
      studentAnswer: clip(input.answer, 2000),
      createdAt: now,
    },
    select: { id: true },
  });
  let after: MasteryStatusV2 | null = null;
  if (topic) {
    after = estimateTopic(await topicObservations(userId, topic), now).status;
    if (before !== after) await logEvent(userId, "topic_mastery_changed", { from: before, to: after });
  }
  return { ok: true, id: created.id, topicId: topic?.id ?? null, before, after };
}

export interface SessionSummary {
  attempted: number;
  correct: number;
  partial: number;
  incorrect: number;
  reviewed: number;
}

/** Finishes a session (idempotent for the owner) and logs counts only. */
export async function completeSession(userId: string, sessionId: string, now: Date = new Date()): Promise<PracticeResult<{ id: string; summary: SessionSummary }>> {
  const session = await db.practiceSession.findFirst({ where: { id: sessionId, userId }, select: { id: true, completedAt: true } });
  if (!session) return { ok: false, error: "Session not found." };
  const evidence = await db.masteryEvidence.findMany({ where: { userId, sessionId }, select: { result: true, isReview: true, topicId: true } });
  const summary: SessionSummary = { attempted: evidence.length, correct: 0, partial: 0, incorrect: 0, reviewed: 0 };
  const reviewedTopics = new Set<string>();
  for (const e of evidence) {
    if (e.result === "CORRECT") summary.correct += 1;
    else if (e.result === "PARTIAL") summary.partial += 1;
    else if (e.result === "INCORRECT") summary.incorrect += 1;
    if (e.isReview && e.topicId) reviewedTopics.add(e.topicId);
  }
  summary.reviewed = reviewedTopics.size;
  if (!session.completedAt) {
    const updated = await db.practiceSession.updateMany({ where: { id: sessionId, userId, completedAt: null }, data: { completedAt: now } });
    if (updated.count > 0) {
      await logEvent(userId, "practice_session_completed", {
        attempted: summary.attempted,
        correct: summary.correct,
        partial: summary.partial,
        incorrect: summary.incorrect,
      });
      if (summary.reviewed > 0) await logEvent(userId, "review_completed", { topics: summary.reviewed });
    }
  }
  return { ok: true, id: sessionId, summary };
}

export interface MistakeView {
  questionId: string;
  prompt: string;
  answer: string;
  explanation: string | null;
  origin: "STUDENT" | "AI_GENERATED";
  topicTitle: string | null;
  lastMissedAt: Date;
  lastResult: "PARTIAL" | "INCORRECT";
  timesMissed: number;
  studentAnswer: string | null;
  /** Answered correctly at some point after the last miss. */
  resolved: boolean;
  hidden: boolean;
}

/** What the student missed in this course, most recent first. */
export async function getMistakes(userId: string, classId: string): Promise<MistakeView[] | null> {
  const course = await db.class.findFirst({ where: { id: classId, userId }, select: { id: true } });
  if (!course) return null;
  const rows = await db.masteryEvidence.findMany({
    where: { userId, classId, questionId: { not: null }, result: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 3000,
    select: {
      questionId: true, result: true, createdAt: true, studentAnswer: true,
      question: { select: { prompt: true, answer: true, explanation: true, origin: true, hiddenAt: true, userId: true, topic: { select: { title: true } } } },
    },
  });
  const byQuestion = new Map<string, MistakeView>();
  for (const row of rows) {
    if (!row.question || row.question.userId !== userId) continue;
    const id = row.questionId!;
    const current = byQuestion.get(id);
    if (row.result === "CORRECT") {
      if (current) current.resolved = true;
      continue;
    }
    byQuestion.set(id, {
      questionId: id,
      prompt: row.question.prompt,
      answer: row.question.answer,
      explanation: row.question.explanation,
      origin: row.question.origin,
      topicTitle: row.question.topic?.title ?? null,
      lastMissedAt: row.createdAt,
      lastResult: row.result as "PARTIAL" | "INCORRECT",
      timesMissed: (current?.timesMissed ?? 0) + 1,
      studentAnswer: row.studentAnswer,
      resolved: false,
      hidden: Boolean(row.question.hiddenAt),
    });
  }
  return [...byQuestion.values()].sort((a, b) => b.lastMissedAt.getTime() - a.lastMissedAt.getTime());
}

export type GenerationProvider = Pick<AIProvider, "generatePracticeQuestions">;

/** Generates practice questions for one topic, grounded in the course's
 * topics and (when they match) its materials. Stored as AI-generated and
 * unverified. Without AI, returns a clear "not available" error. */
export async function generateQuestions(
  userId: string,
  classId: string,
  topicId: string,
  options: { provider?: GenerationProvider; available?: boolean; count?: number } = {},
): Promise<PracticeResult<{ ids: string[] }>> {
  const available = options.available ?? aiEnabled;
  if (!available) return { ok: false, error: "Generated questions aren't available yet. You can still add your own." };
  const course = await db.class.findFirst({ where: { id: classId, userId }, select: { id: true, name: true, subject: true, level: true } });
  if (!course) return { ok: false, error: "Course not found." };
  const topic = await ownedTopicIn(userId, classId, topicId);
  if (!topic) return { ok: false, error: "Topic not found." };

  const [related, hits] = await Promise.all([
    db.courseTopic.findMany({ where: { userId, classId, status: "CONFIRMED", NOT: { id: topic.id } }, orderBy: { position: "asc" }, take: 20, select: { title: true } }),
    searchMaterials(userId, { query: topic.title, classId, limit: 4 }),
  ]);
  const profile = subjectProfile(course);
  const count = Math.max(1, Math.min(5, options.count ?? 3));

  const reservation = await reserveAi(userId, "practice_questions");
  if (!reservation.ok) return { ok: false, error: reservation.message };
  const meter: { usage: CallUsage | null } = { usage: null };
  try {
    const generated = await (options.provider ?? aiProvider).generatePracticeQuestions(
      {
        courseName: course.name,
        level: levelLabel(course.level ?? undefined),
        topic: topic.title,
        relatedTopics: related.map((r) => r.title),
        excerpts: hits.filter((h) => h.excerpt).map((h) => ({ title: h.title, text: h.excerpt })),
        formatInstruction: profile.generationInstruction,
        count,
      },
      (u) => {
        meter.usage = u;
      },
    );
    const recorded = meter.usage;
    if (!generated || generated.length === 0) {
      await failAi(reservation.usageId, "no_output", recorded?.model, recorded ?? undefined);
      return { ok: false, error: "Rushd couldn't generate questions right now. You can still add your own." };
    }
    await settleAi(reservation.usageId, recorded?.model ?? "unknown", recorded ?? { inputTokens: 0, outputTokens: 0 });
    const sourceNote = hits.length
      ? `Based on your topic and ${hits.length} of your course materials (${hits.map((h) => h.title).slice(0, 2).join(", ")}${hits.length > 2 ? ", …" : ""}).`
      : "Based on your topic name only; no course materials matched.";
    const ids: string[] = [];
    for (const q of generated.slice(0, count)) {
      const created = await db.practiceQuestion.create({
        data: {
          userId,
          classId,
          topicId: topic.id,
          origin: "AI_GENERATED",
          format: profile.format,
          prompt: q.prompt,
          answer: q.answer,
          explanation: q.explanation,
          hints: q.hints.slice(0, 3),
          difficulty: q.difficulty,
          sourceNote,
          aiModel: recorded?.model ?? null,
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    await logEvent(userId, "practice_questions_generated", { count: ids.length, grounded: hits.length > 0 });
    return { ok: true, ids };
  } catch (error) {
    console.error("[practice] generation failed", (error as Error)?.name ?? typeof error);
    await failAi(reservation.usageId, (error as Error)?.name ?? "error").catch(() => {});
    return { ok: false, error: "Rushd couldn't generate questions right now. You can still add your own." };
  }
}
