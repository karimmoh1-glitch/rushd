import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { aiEnabled, env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { resolveTimeZone, formatDateInZone } from "@/lib/time/zone";
import { newMeter, runTutorTurn, tutorClient, type TutorEvent, type TutorMode } from "@/lib/tutor/agent";
import { compactPreferences, readPreferences } from "@/lib/tutor/preferences";
import { assembleCourseContext } from "@/lib/tutor/context";
import { loadCourseContext } from "@/lib/tutor/course-context";
import { toTurnHistory } from "@/lib/tutor/history";
import { failAi, getAiSettings, reserveAi, settleAi } from "@/lib/ai/usage";

export const maxDuration = 60;

const BodySchema = z.object({
  conversationId: z.string().min(1).max(64).nullish(),
  message: z.string().trim().min(1, "Type a question first.").max(4000, "Keep it under 4,000 characters."),
  classId: z.string().min(1).max(64).nullish(),
  assignmentId: z.string().min(1).max(64).nullish(),
  /** "Ask the tutor about this topic / mistake": only read for a new conversation. */
  focusTopicId: z.string().min(1).max(64).nullish(),
  focusQuestionId: z.string().min(1).max(64).nullish(),
  mode: z.enum(["explain", "quiz", "plan"]).default("explain"),
});

const HISTORY_MESSAGES = 20;
// Burst protection on top of the plan quotas enforced by reserveAi.
const HOURLY_LIMIT = 30;
const MINUTE_LIMIT = 6;

/** Unavailable (no key, or AI switched off): the page shows the no-AI path. */
const UNAVAILABLE = { error: "The tutor isn't available right now.", fallback: true };

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/** Route handlers don't get Server Actions' built-in origin check, so do it
 * here: only same-origin browser requests may spend the student's quota. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin, new URL(env.NEXT_PUBLIC_APP_URL).origin]);
  return allowed.has(origin);
}

/** Turns an AI provider error into a message the student can act on. */
function providerError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return "The tutor is busy right now. Try again in a minute.";
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "The tutor isn't configured correctly on this server.";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "The tutor took too long to answer. Try a narrower question.";
  }
  if (error instanceof Anthropic.APIError) {
    return "The AI provider had a problem answering. Try again shortly.";
  }
  return "Something went wrong. Try again.";
}

const conversationFields = { id: true, classId: true, assignmentId: true, mode: true, focusTopicId: true, focusQuestionId: true } as const;
type ConversationRow = {
  id: string;
  classId: string | null;
  assignmentId: string | null;
  mode: string;
  focusTopicId: string | null;
  focusQuestionId: string | null;
};

/** Loads the class name and assignment title, only if this user owns them. */
async function loadConversationLabels(userId: string, classId: string | null, assignmentId: string | null) {
  let className: string | null = null;
  let assignmentTitle: string | null = null;
  if (classId) {
    const cls = await db.class.findFirst({ where: { id: classId, userId }, select: { name: true } });
    className = cls?.name ?? null;
  }
  if (assignmentId) {
    const assignment = await db.assignment.findFirst({ where: { id: assignmentId, userId }, select: { title: true } });
    assignmentTitle = assignment?.title ?? null;
  }
  return { className, assignmentTitle };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return json(403, { error: "Forbidden." });
  }
  const user = await getCurrentUser();
  if (!user) {
    return json(401, { error: "Log in to use the tutor." });
  }
  if (!aiEnabled || !(await getAiSettings()).enabled) {
    return json(503, UNAVAILABLE);
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid request." });
  }
  const input = parsed.data;

  const burst = await checkRateLimit(`tutor-minute:${user.id}`, { max: MINUTE_LIMIT, windowMs: 60 * 1000 });
  if (!burst.allowed) {
    return json(429, { error: "That's a lot of messages at once. Wait a minute and try again." });
  }
  const hourly = await checkRateLimit(`tutor-hour:${user.id}`, { max: HOURLY_LIMIT, windowMs: 60 * 60 * 1000 });
  if (!hourly.allowed) {
    return json(429, { error: "That's a lot of messages in an hour. Take a short break and try again." });
  }

  // Find or create the conversation, re-checking every id against this user.
  let conversation: ConversationRow | null;
  if (input.conversationId) {
    conversation = await db.tutorConversation.findFirst({
      where: { id: input.conversationId, userId: user.id },
      select: conversationFields,
    });
    if (!conversation) {
      return json(404, { error: "Conversation not found." });
    }
    if (conversation.mode !== input.mode) {
      await db.tutorConversation.update({ where: { id: conversation.id }, data: { mode: input.mode } });
    }
  } else {
    let classId: string | null = null;
    let assignmentId: string | null = null;
    if (input.assignmentId) {
      const ownedAssignment = await db.assignment.findFirst({
        where: { id: input.assignmentId, userId: user.id },
        select: { id: true, classId: true },
      });
      if (!ownedAssignment) {
        return json(404, { error: "Assignment not found." });
      }
      assignmentId = ownedAssignment.id;
      classId = ownedAssignment.classId;
    } else if (input.classId) {
      const ownedClass = await db.class.findFirst({ where: { id: input.classId, userId: user.id }, select: { id: true } });
      if (!ownedClass) {
        return json(404, { error: "Course not found." });
      }
      classId = ownedClass.id;
    }
    // A focus topic or mistake must be the student's own, in the same course.
    let focusTopicId: string | null = null;
    let focusQuestionId: string | null = null;
    if (input.focusQuestionId) {
      const question = await db.practiceQuestion.findFirst({
        where: { id: input.focusQuestionId, userId: user.id, ...(classId ? { classId } : {}) },
        select: { id: true, classId: true },
      });
      if (!question) return json(404, { error: "Question not found." });
      focusQuestionId = question.id;
      classId = question.classId;
    } else if (input.focusTopicId) {
      const topic = await db.courseTopic.findFirst({
        where: { id: input.focusTopicId, userId: user.id, status: "CONFIRMED", ...(classId ? { classId } : {}) },
        select: { id: true, classId: true },
      });
      if (!topic) return json(404, { error: "Topic not found." });
      focusTopicId = topic.id;
      classId = topic.classId;
    }
    conversation = await db.tutorConversation.create({
      data: { userId: user.id, classId, assignmentId, focusTopicId, focusQuestionId, mode: input.mode, title: input.message.slice(0, 80) },
      select: conversationFields,
    });
    let entry = "none";
    if (focusQuestionId) entry = "mistake";
    else if (focusTopicId) entry = "topic";
    else if (assignmentId) entry = "assignment";
    else if (classId) entry = "course";
    // Ids and counts only, never content.
    await logEvent(user.id, "tutor_session_started", { classId, entry });
  }

  const reservation = await reserveAi(user.id, "tutor_message");
  if (!reservation.ok) {
    if (reservation.reason === "disabled" || reservation.reason === "global_budget") {
      return json(503, { ...UNAVAILABLE, error: reservation.message });
    }
    return json(429, { error: reservation.message, reason: reservation.reason });
  }
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const now = new Date();

  const [storedMessages, labels, profile, course] = await Promise.all([
    db.tutorMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGES,
      select: { role: true, content: true },
    }),
    loadConversationLabels(user.id, conversation.classId, conversation.assignmentId),
    db.profile.findUnique({ where: { userId: user.id }, select: { tutorInstructions: true, tutorPreferences: true } }),
    loadCourseContext(user.id, {
      classId: conversation.classId,
      focusTopicId: conversation.focusTopicId,
      focusQuestionId: conversation.focusQuestionId,
      question: input.message,
      now,
      timeZone,
    }),
  ]);
  const studentPreferences = readPreferences(profile?.tutorPreferences);
  const preferences = compactPreferences(studentPreferences, profile?.tutorInstructions);
  const courseContext = assembleCourseContext(course.input);
  const conversationId = conversation.id;
  const scope = {
    userId: user.id,
    classId: conversation.classId,
    assignmentId: conversation.assignmentId,
    timeZone,
    now,
    conversationId,
    studentMessage: input.message,
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Each event is one line of JSON (newline-delimited JSON).
      function send(event: TutorEvent | Record<string, unknown>) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      send({ type: "start", conversationId });
      const meter = newMeter();
      try {
        const result = await runTutorTurn({
          client: tutorClient(),
          scope,
          context: {
            className: labels.className,
            assignmentTitle: labels.assignmentTitle,
            mode: input.mode as TutorMode,
            preferences,
            courseContext: courseContext.text,
            hintsFirst: studentPreferences.approach !== "worked_examples",
            todayLabel: formatDateInZone(now, timeZone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
          },
          history: toTurnHistory(storedMessages),
          userText: input.message,
          onEvent: send,
          signal: request.signal,
          meter,
          preloaded: course.materials,
        });
        await settleAi(reservation.usageId, meter.model, meter);
        // Only store sources when there are some.
        let sources: Prisma.InputJsonValue | undefined = undefined;
        if (result.sources.length > 0) {
          sources = result.sources as unknown as Prisma.InputJsonValue;
        }
        let cards: Prisma.InputJsonValue | undefined = undefined;
        if (result.cards.length > 0) {
          cards = result.cards as unknown as Prisma.InputJsonValue;
        }
        const [, saved] = await db.$transaction([
          db.tutorMessage.create({ data: { conversationId, role: "user", content: input.message } }),
          db.tutorMessage.create({
            data: { conversationId, role: "assistant", content: result.text, sources, cards },
            select: { id: true },
          }),
          db.tutorConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
        ]);
        // Counts only, never content.
        await logEvent(user.id, "tutor_message", {
          rounds: result.usage.rounds,
          sources: result.sources.length,
          cards: result.cards.length,
          refused: result.refused,
          contextTokens: courseContext.tokens,
        });
        send({ type: "done", conversationId, message: { id: saved.id, content: result.text, sources: result.sources, cards: result.cards } });
      } catch (error) {
        // Error type only: never the message content or the provider's text.
        console.error("[tutor] turn failed", (error as Error)?.name ?? typeof error);
        const billed = meter.inputTokens + meter.outputTokens > 0;
        await failAi(reservation.usageId, (error as Error)?.name ?? "error", meter.model, billed ? meter : undefined).catch(() => {});
        send({ type: "error", error: providerError(error), fallback: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
