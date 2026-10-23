import { describe, it, expect, afterEach, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { reply, scriptedTutor } from "@/test/scripted-tutor-model";
import { addTopic } from "@/lib/learning/topics";
import { createQuestion } from "@/lib/learning/practice";
import type { TutorClient } from "./agent";

// The /api/tutor route end to end against the real database: session, AI
// availability and the model are stand-ins; everything else is real.

const state = vi.hoisted(() => ({
  user: null as null | { id: string; profile: { displayName: string; timezone: string } },
  aiEnabled: true,
  client: null as unknown,
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...original,
    get aiEnabled() {
      return state.aiEnabled;
    },
  };
});
vi.mock("@/lib/tutor/agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tutor/agent")>();
  return { ...original, tutorClient: () => state.client as TutorClient };
});

const { POST } = await import("@/app/api/tutor/route");

const users: string[] = [];
afterEach(async () => {
  await Promise.all(users.splice(0).map(deleteTestUser));
  state.user = null;
  state.aiEnabled = true;
});

async function signedIn() {
  const user = await createTestUser();
  users.push(user.id);
  // Each test user gets its own rate-limit buckets by id; nothing to reset.
  const cls = await db.class.create({ data: { userId: user.id, name: "AP Chemistry", level: "AP", color: "#0f766e" } });
  state.user = { id: user.id, profile: { displayName: "Test", timezone: "UTC" } };
  return { userId: user.id, classId: cls.id };
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
}

async function events(response: Response) {
  const text = await response.text();
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("/api/tutor (real DB, stand-in model)", { timeout: 90_000 }, () => {
  it("falls back gracefully when the provider throws: an honest error with the no-AI path, nothing stored or billed", async () => {
    const { userId, classId } = await signedIn();
    state.client = {
      beta: {
        messages: {
          stream() {
            throw new Anthropic.APIConnectionError({ message: "down" });
          },
        },
      },
    };
    const response = await post({ message: "What is a mole? my secret phrase", classId });
    expect(response.status).toBe(200);
    const stream = await events(response);
    expect(stream[0]).toMatchObject({ type: "start" });
    expect(stream.at(-1)).toEqual({ type: "error", error: "The AI provider had a problem answering. Try again shortly.", fallback: true });
    expect(await db.tutorMessage.count({ where: { conversation: { userId } } })).toBe(0);
    const usage = await db.aiUsage.findFirstOrThrow({ where: { userId } });
    expect(usage).toMatchObject({ status: "failed", costMicros: 0 });

    // The session event names the course, never the message.
    const started = await db.event.findFirstOrThrow({ where: { userId, name: "tutor_session_started" } });
    expect(started.properties).toEqual({ classId, entry: "course" });
    const all = await db.event.findMany({ where: { userId } });
    expect(JSON.stringify(all.map((e) => e.properties))).not.toContain("secret phrase");
  });

  it("answers with course context and stores the reply with its cards", async () => {
    const { userId, classId } = await signedIn();
    const model = scriptedTutor([reply("Which part of moles feels unclear: the definition or the conversions?")]);
    state.client = model.client;
    const stream = await events(await post({ message: "help with chem", classId }));
    expect(stream.at(-1)).toMatchObject({ type: "done", message: { content: expect.stringContaining("Which part"), cards: [] } });
    const system = (model.requests[0].system as { text: string }[]).map((b) => b.text).join("\n");
    expect(system).toContain("Course: AP Chemistry, level AP");
    expect(system).toContain("No syllabus has been uploaded");
    const event = await db.event.findFirstOrThrow({ where: { userId, name: "tutor_message" } });
    expect(event.properties).toMatchObject({ rounds: 1, sources: 0, cards: 0, refused: false });
  });

  it("shows the no-AI path when AI is off, instead of an error", async () => {
    await signedIn();
    state.aiEnabled = false;
    const response = await post({ message: "hello" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The tutor isn't available right now.", fallback: true });
  });

  it("starts from a mistake or topic only if it's the student's own", async () => {
    const a = await signedIn();
    const topic = await addTopic(a.userId, a.classId, { title: "Moles" });
    if (!topic.ok) throw new Error("setup");
    const question = await createQuestion(a.userId, a.classId, { topicId: topic.id, prompt: "Moles in 18 g of water?", answer: "1 mol" });
    if (!question.ok) throw new Error("setup");

    const b = await signedIn();
    state.client = scriptedTutor([reply("unused")]).client;
    expect((await post({ message: "explain", focusQuestionId: question.id })).status).toBe(404);
    expect((await post({ message: "explain", focusTopicId: topic.id })).status).toBe(404);
    expect((await post({ message: "explain", classId: a.classId })).status).toBe(404);
    expect(await db.tutorConversation.count({ where: { userId: b.userId } })).toBe(0);

    // A's own mistake works, and the conversation remembers it.
    state.user = { id: a.userId, profile: { displayName: "A", timezone: "UTC" } };
    state.client = scriptedTutor([reply("Let's look at what you wrote.")]).client;
    const stream = await events(await post({ message: "Help me understand why I missed this", focusQuestionId: question.id }));
    expect(stream.at(-1)).toMatchObject({ type: "done" });
    const conversation = await db.tutorConversation.findFirstOrThrow({ where: { userId: a.userId } });
    expect(conversation).toMatchObject({ classId: a.classId, focusQuestionId: question.id });
    const started = await db.event.findFirstOrThrow({ where: { userId: a.userId, name: "tutor_session_started" } });
    expect(started.properties).toEqual({ classId: a.classId, entry: "mistake" });
  });

  it("rejects oversized input before spending anything", async () => {
    const { userId } = await signedIn();
    const response = await post({ message: "x".repeat(4001) });
    expect(response.status).toBe(400);
    expect(await db.aiUsage.count({ where: { userId } })).toBe(0);
  });
});
