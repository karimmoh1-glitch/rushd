"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import * as topics from "@/lib/learning/topics";
import * as practice from "@/lib/learning/practice";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

// Thin wrappers: read the session, validate input, call the learning services
// (src/lib/learning), which scope every query by the student's own userId.
// Ownership is tested against the services in
// src/lib/learning/learning.integration.test.ts.

type Result<T = object> = ({ success: true } & T) | { error: string };

const Id = z.string().min(1).max(64);
const Title = z.string().trim().min(1, "Give the topic a name.").max(120, "Keep topic names under 120 characters.");

function invalid(error: z.ZodError): { error: string } {
  return { error: error.issues[0]?.message ?? "Invalid input." };
}

function refreshCourse(classId: string) {
  revalidatePath(`/courses/${classId}`, "layout");
  revalidatePath("/mastery");
}

function done<T extends object>(result: ({ ok: true } & T) | { ok: false; error: string }, classId?: string): Result<Omit<T, "ok">> {
  if (!result.ok) return { error: result.error };
  if (classId) refreshCourse(classId);
  const rest: Record<string, unknown> = { ...result };
  delete rest.ok;
  return { success: true, ...(rest as Omit<T, "ok">) };
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export async function addTopicAction(input: { classId: string; title: string; parentId?: string | null }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, title: Title, parentId: Id.nullish() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.addTopic(user.id, parsed.data.classId, parsed.data), parsed.data.classId);
}

export async function updateTopicAction(input: { classId: string; topicId: string; title?: string; parentId?: string | null }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicId: Id, title: Title.optional(), parentId: Id.nullable().optional() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { classId, topicId, ...changes } = parsed.data;
  return done(await topics.updateTopic(user.id, topicId, changes), classId);
}

export async function moveTopicAction(input: { classId: string; topicId: string; direction: "up" | "down" }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicId: Id, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.moveTopic(user.id, parsed.data.topicId, parsed.data.direction), parsed.data.classId);
}

export async function deleteTopicAction(input: { classId: string; topicId: string }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicId: Id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.deleteTopic(user.id, parsed.data.topicId), parsed.data.classId);
}

export async function confirmTopicsAction(input: { classId: string; topicIds: string[] }): Promise<Result<{ confirmed: number }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicIds: z.array(Id).min(1).max(200) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.confirmTopics(user.id, parsed.data.classId, parsed.data.topicIds), parsed.data.classId);
}

export async function dismissTopicsAction(input: { classId: string; topicIds: string[] }): Promise<Result<{ dismissed: number }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicIds: z.array(Id).min(1).max(200) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.dismissProposedTopics(user.id, parsed.data.classId, parsed.data.topicIds), parsed.data.classId);
}

export async function addPrerequisiteAction(input: { classId: string; topicId: string; prerequisiteId: string }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicId: Id, prerequisiteId: Id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.addPrerequisite(user.id, parsed.data.topicId, parsed.data.prerequisiteId), parsed.data.classId);
}

export async function removePrerequisiteAction(input: { classId: string; topicId: string; prerequisiteId: string }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicId: Id, prerequisiteId: Id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await topics.removePrerequisite(user.id, parsed.data.topicId, parsed.data.prerequisiteId), parsed.data.classId);
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

const QuestionInput = z.object({
  classId: Id,
  topicId: Id.nullish(),
  prompt: z.string().trim().min(1, "Write the question.").max(2000, "Keep the question under 2,000 characters."),
  answer: z.string().trim().min(1, "Write the answer.").max(3000, "Keep the answer under 3,000 characters."),
  explanation: z.string().trim().max(2000).nullish(),
  hints: z.array(z.string().trim().max(300)).max(3).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
});

export async function createQuestionAction(input: z.input<typeof QuestionInput>): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = QuestionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { classId, ...question } = parsed.data;
  return done(await practice.createQuestion(user.id, classId, question), classId);
}

export async function removeQuestionAction(input: { classId: string; questionId: string }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, questionId: Id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await practice.removeQuestion(user.id, parsed.data.questionId), parsed.data.classId);
}

export async function reportQuestionAction(input: { classId: string; questionId: string; reason: practice.ReportReason; note?: string }): Promise<Result<{ id: string }>> {
  const user = await requireUserOrThrow();
  const parsed = z
    .object({ classId: Id, questionId: Id, reason: z.enum(practice.REPORT_REASONS), note: z.string().trim().max(1000).optional() })
    .safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return done(await practice.reportQuestion(user.id, parsed.data.questionId, parsed.data.reason, parsed.data.note), parsed.data.classId);
}

export async function generateQuestionsAction(input: { classId: string; topicId: string }): Promise<Result<{ ids: string[] }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, topicId: Id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const rate = await checkRateLimit(`practice-generate:${user.id}`, { max: 10 });
  if (!rate.allowed) return { error: "Generating too often. Try again in a few minutes." };
  return done(await practice.generateQuestions(user.id, parsed.data.classId, parsed.data.topicId), parsed.data.classId);
}

export async function startSessionAction(input: {
  classId: string;
  topicId?: string | null;
  mode?: practice.SessionMode;
  questionIds?: string[];
}): Promise<Result<{ id: string; questions: number }>> {
  const user = await requireUserOrThrow();
  const parsed = z
    .object({ classId: Id, topicId: Id.nullish(), mode: z.enum(["practice", "review", "mistakes"]).optional(), questionIds: z.array(Id).max(50).optional() })
    .safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { classId, ...options } = parsed.data;
  return done(await practice.startSession(user.id, classId, options));
}

const AttemptInput = z.object({
  sessionId: Id,
  questionId: Id,
  result: z.enum(["CORRECT", "PARTIAL", "INCORRECT"]),
  hintsUsed: z.number().int().min(0).max(10),
  confidence: z.number().int().min(1).max(3).nullish(),
  timeTakenSec: z.number().min(0).max(36_000).nullish(),
  answer: z.string().max(4000).nullish(),
});

export async function recordAttemptAction(
  input: z.input<typeof AttemptInput>,
): Promise<Result<{ before: string | null; after: string | null }>> {
  const user = await requireUserOrThrow();
  const parsed = AttemptInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { sessionId, ...attempt } = parsed.data;
  const result = await practice.recordAttempt(user.id, sessionId, attempt);
  if (!result.ok) return { error: result.error };
  return { success: true, before: result.before, after: result.after };
}

export async function completeSessionAction(input: { classId: string; sessionId: string }): Promise<Result<{ summary: practice.SessionSummary }>> {
  const user = await requireUserOrThrow();
  const parsed = z.object({ classId: Id, sessionId: Id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await practice.completeSession(user.id, parsed.data.sessionId);
  if (!result.ok) return { error: result.error };
  // New evidence can change review blocks and exam prep: replan and record what moved.
  await regeneratePlanSnapshot(user.id, "practice_completed");
  refreshCourse(parsed.data.classId);
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  return { success: true, summary: result.summary };
}
