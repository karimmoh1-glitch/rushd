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
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";

export const maxDuration = 60;

const BodySchema = z.object({
  conversationId: z.string().min(1).max(64).nullish(),
  message: z.string().trim().min(1, "Type a question first.").max(4000, "Keep it under 4,000 characters."),
  classId: z.string().min(1).max(64).nullish(),
  assignmentId: z.string().min(1).max(64).nullish(),
  mode: z.enum(["explain", "quiz", "plan"]).default("explain"),
});

const HISTORY_MESSAGES = 20;
// Burst protection on top of the plan quotas enforced by reserveAi.
const HOURLY_LIMIT = 30;

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

const conversationFields = { id: true, classId: true, assignmentId: true, mode: true } as const;
type ConversationRow = { id: string; classId: string | null; assignmentId: string | null; mode: string };

/** Stored messages come newest first; the model wants them oldest first. */
function toTurnHistory(newestFirst: { role: string; content: string }[]) {
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const message = newestFirst[i];
    if (message.role === "user" || message.role === "assistant") {
      history.push({ role: message.role, content: message.content });
    }
  }
  return history;
}

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
  const requestId = requestIdFrom(request.headers);
  return withRequestIdHeader(await handleTutorTurn(request, requestId), requestId);
}

async function handleTutorTurn(request: Request, requestId: string): Promise<Response> {
  if (!sameOrigin(request)) {
    return json(403, { error: "Forbidden." });
  }
  const user = await getCurrentUser();
  if (!user) {
    return json(401, { error: "Log in to use the tutor." });
  }
  if (!aiEnabled) {
    return json(503, { error: "The tutor isn't available on this server yet." });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid request." });
  }
  const input = parsed.data;

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
    conversation = await db.tutorConversation.create({
      data: { userId: user.id, classId, assignmentId, mode: input.mode, title: input.message.slice(0, 80) },
      select: conversationFields,
    });
  }

  const reservation = await reserveAi(user.id, "tutor_message");
  if (!reservation.ok) {
    return json(429, { error: reservation.message, reason: reservation.reason });
  }

  const [storedMessages, labels, profile] = await Promise.all([
    db.tutorMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGES,
      select: { role: true, content: true },
    }),
    loadConversationLabels(user.id, conversation.classId, conversation.assignmentId),
    db.profile.findUnique({ where: { userId: user.id }, select: { tutorInstructions: true, tutorPreferences: true } }),
  ]);
  const preferences = compactPreferences(readPreferences(profile?.tutorPreferences), profile?.tutorInstructions);
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const now = new Date();
  const conversationId = conversation.id;
  const scope = { userId: user.id, classId: conversation.classId, assignmentId: conversation.assignmentId, timeZone, now };

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
            todayLabel: formatDateInZone(now, timeZone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
          },
          history: toTurnHistory(storedMessages),
          userText: input.message,
          onEvent: send,
          signal: request.signal,
          meter,
        });
        await settleAi(reservation.usageId, meter.model, meter);
        // Only store sources when there are some.
        let sources: Prisma.InputJsonValue | undefined = undefined;
        if (result.sources.length > 0) {
          sources = result.sources as unknown as Prisma.InputJsonValue;
        }
        const [, saved] = await db.$transaction([
          db.tutorMessage.create({ data: { conversationId, role: "user", content: input.message } }),
          db.tutorMessage.create({
            data: { conversationId, role: "assistant", content: result.text, sources },
            select: { id: true },
          }),
          db.tutorConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
        ]);
        // Counts only, never content.
        await logEvent(user.id, "tutor_message", { rounds: result.usage.rounds, sources: result.sources.length, refused: result.refused });
        send({ type: "done", conversationId, message: { id: saved.id, content: result.text, sources: result.sources } });
      } catch (error) {
        log.error("tutor.turn_failed", { requestId, err: error });
        const billed = meter.inputTokens + meter.outputTokens > 0;
        await failAi(reservation.usageId, (error as Error)?.name ?? "error", meter.model, billed ? meter : undefined).catch(() => {});
        send({ type: "error", error: providerError(error) });
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
