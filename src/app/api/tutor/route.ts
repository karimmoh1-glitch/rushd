import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { aiEnabled, env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { resolveTimeZone, formatDateInZone } from "@/lib/time/zone";
import { runTutorTurn, tutorClient, type TutorEvent, type TutorMode } from "@/lib/tutor/agent";

export const maxDuration = 60;

const BodySchema = z.object({
  conversationId: z.string().min(1).max(64).nullish(),
  message: z.string().trim().min(1, "Type a question first.").max(4000, "Keep it under 4,000 characters."),
  classId: z.string().min(1).max(64).nullish(),
  assignmentId: z.string().min(1).max(64).nullish(),
  mode: z.enum(["explain", "quiz", "plan"]).default("explain"),
});

const HISTORY_MESSAGES = 20;
const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 80;

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

function providerError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "The tutor is busy right now. Try again in a minute.";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "The tutor isn't configured correctly on this server.";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "The tutor took too long to answer. Try a narrower question.";
  if (error instanceof Anthropic.APIError) return "The AI provider had a problem answering. Try again shortly.";
  return "Something went wrong. Try again.";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "Forbidden." });
  const user = await getCurrentUser();
  if (!user) return json(401, { error: "Log in to use the tutor." });
  if (!aiEnabled) return json(503, { error: "The tutor isn't available on this server yet." });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid request." });
  const input = parsed.data;

  const hourly = await checkRateLimit(`tutor-hour:${user.id}`, { max: HOURLY_LIMIT, windowMs: 60 * 60 * 1000 });
  const daily = hourly.allowed ? await checkRateLimit(`tutor-day:${user.id}`, { max: DAILY_LIMIT, windowMs: 24 * 60 * 60 * 1000 }) : hourly;
  if (!hourly.allowed || !daily.allowed) {
    return json(429, { error: "You've reached the tutor's limit for now. It resets within the hour (or by tomorrow for the daily limit)." });
  }

  // Resolve the conversation, re-checking every id against this user.
  let conversation = input.conversationId
    ? await db.tutorConversation.findFirst({
        where: { id: input.conversationId, userId: user.id },
        select: { id: true, classId: true, assignmentId: true, mode: true },
      })
    : null;
  if (input.conversationId && !conversation) return json(404, { error: "Conversation not found." });

  if (!conversation) {
    let classId: string | null = null;
    let assignmentId: string | null = null;
    if (input.assignmentId) {
      const a = await db.assignment.findFirst({ where: { id: input.assignmentId, userId: user.id }, select: { id: true, classId: true } });
      if (!a) return json(404, { error: "Assignment not found." });
      assignmentId = a.id;
      classId = a.classId;
    } else if (input.classId) {
      const c = await db.class.findFirst({ where: { id: input.classId, userId: user.id }, select: { id: true } });
      if (!c) return json(404, { error: "Class not found." });
      classId = c.id;
    }
    conversation = await db.tutorConversation.create({
      data: { userId: user.id, classId, assignmentId, mode: input.mode, title: input.message.slice(0, 80) },
      select: { id: true, classId: true, assignmentId: true, mode: true },
    });
  } else if (conversation.mode !== input.mode) {
    await db.tutorConversation.update({ where: { id: conversation.id }, data: { mode: input.mode } });
  }

  const [history, cls, assignment] = await Promise.all([
    db.tutorMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGES,
      select: { role: true, content: true },
    }),
    conversation.classId ? db.class.findFirst({ where: { id: conversation.classId, userId: user.id }, select: { name: true } }) : null,
    conversation.assignmentId
      ? db.assignment.findFirst({ where: { id: conversation.assignmentId, userId: user.id }, select: { title: true } })
      : null,
  ]);
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const now = new Date();
  const conversationId = conversation.id;
  const scope = { userId: user.id, classId: conversation.classId, assignmentId: conversation.assignmentId, timeZone, now };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TutorEvent | Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "start", conversationId });
      try {
        const result = await runTutorTurn({
          client: tutorClient(),
          scope,
          context: {
            className: cls?.name ?? null,
            assignmentTitle: assignment?.title ?? null,
            mode: input.mode as TutorMode,
            todayLabel: formatDateInZone(now, timeZone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
          },
          history: history
            .reverse()
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          userText: input.message,
          onEvent: send,
          signal: request.signal,
        });
        const [, saved] = await db.$transaction([
          db.tutorMessage.create({ data: { conversationId, role: "user", content: input.message } }),
          db.tutorMessage.create({
            data: { conversationId, role: "assistant", content: result.text, sources: result.sources.length ? (result.sources as unknown as Prisma.InputJsonValue) : undefined },
            select: { id: true },
          }),
          db.tutorConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
        ]);
        // Usage only, never content.
        await logEvent(user.id, "tutor_message", {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          rounds: result.usage.rounds,
          sources: result.sources.length,
          refused: result.refused,
        });
        send({ type: "done", conversationId, message: { id: saved.id, content: result.text, sources: result.sources } });
      } catch (error) {
        console.error("[tutor] turn failed", (error as Error)?.name ?? typeof error);
        send({ type: "error", error: providerError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
