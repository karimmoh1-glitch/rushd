import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { lastToolResult, reply, scriptedTutor, toolCall } from "@/test/scripted-tutor-model";
import type { GeneratedQuestion } from "@/lib/ai/schemas";
import { addPrerequisite, addTopic } from "@/lib/learning/topics";
import { createQuestion, recordAttempt, startSession, type GenerationProvider } from "@/lib/learning/practice";
import { runTutorTurn, type TurnContext } from "./agent";
import { assembleCourseContext } from "./context";
import { loadCourseContext } from "./course-context";
import { takeHint } from "./checks";
import { acceptPracticeOffer, acceptRevisionPlan, type PinBlock } from "./offers";
import type { TutorScope } from "./tools";
import type { TutorCard } from "./cards";

// Real database and real learning-core services; the model and the question
// generator are scripted. NOTE: no live model is exercised here.

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-21T16:00:00Z");

const users: string[] = [];
afterEach(async () => {
  await Promise.all(users.splice(0).map(deleteTestUser));
});

async function student(name = "Chem student") {
  const user = await createTestUser({ displayName: name });
  users.push(user.id);
  const cls = await db.class.create({ data: { userId: user.id, name: "AP Chemistry", level: "AP", subject: "Chemistry", color: "#0f766e" } });
  const moles = await addTopic(user.id, cls.id, { title: "Moles" });
  const stoich = await addTopic(user.id, cls.id, { title: "Stoichiometry" });
  if (!moles.ok || !stoich.ok) throw new Error("setup");
  await addPrerequisite(user.id, stoich.id, moles.id);
  const q = await createQuestion(user.id, cls.id, {
    topicId: stoich.id,
    prompt: "How many moles of O2 react with 4 mol of H2 (2H2 + O2 -> 2H2O)?",
    answer: "2 mol",
    hints: ["Look at the coefficients.", "The ratio H2:O2 is 2:1."],
    difficulty: 2,
  });
  const missed = await createQuestion(user.id, cls.id, { topicId: moles.id, prompt: "How many moles are in 36 g of water?", answer: "2 mol" });
  if (!q.ok || !missed.ok) throw new Error("setup");
  // One missed answer two days ago: a mistake, and Moles now needs review.
  const session = await startSession(user.id, cls.id, { mode: "mistakes", questionIds: [missed.id] }, new Date(T0.getTime() - 2 * DAY));
  if (!session.ok) throw new Error("setup");
  await recordAttempt(user.id, session.id, { questionId: missed.id, result: "INCORRECT", hintsUsed: 0, answer: "0.5 mol" }, new Date(T0.getTime() - 2 * DAY));
  const exam = await db.exam.create({ data: { userId: user.id, classId: cls.id, title: "Unit 3 test", examAt: new Date(T0.getTime() + 6 * DAY) } });
  const conversation = await db.tutorConversation.create({ data: { userId: user.id, classId: cls.id, mode: "explain", title: "Chem help" } });
  return { userId: user.id, classId: cls.id, molesId: moles.id, stoichId: stoich.id, questionId: q.id, missedId: missed.id, examId: exam.id, conversationId: conversation.id };
}

type Student = Awaited<ReturnType<typeof student>>;

function scopeFor(s: Student, now: Date, studentMessage: string): TutorScope {
  return { userId: s.userId, classId: s.classId, assignmentId: null, timeZone: "UTC", now, conversationId: s.conversationId, studentMessage };
}

const CONTEXT: TurnContext = { className: "AP Chemistry", assignmentTitle: null, mode: "explain", todayLabel: "Wednesday" };

async function turn(s: Student, now: Date, message: string, steps: Parameters<typeof scriptedTutor>[0], context: TurnContext = CONTEXT) {
  const model = scriptedTutor(steps);
  const result = await runTutorTurn({ client: model.client, scope: scopeFor(s, now, message), context, history: [], userText: message, onEvent: () => {} });
  return { ...model, result };
}

async function evidenceCount(userId: string) {
  return db.masteryEvidence.count({ where: { userId } });
}

async function storeReply(s: Student, cards: TutorCard[]) {
  return db.tutorMessage.create({ data: { conversationId: s.conversationId, role: "assistant", content: "…", cards: cards as object[] } });
}

describe("course context assembly (real DB)", { timeout: 90_000 }, () => {
  it("assembles the course, v2 mastery, remediation, mistakes, the exam, and the unknowns", async () => {
    const a = await student();
    const loaded = await loadCourseContext(a.userId, { classId: a.classId, focusQuestionId: a.missedId, question: "moles of oxygen", now: T0, timeZone: "UTC" });
    expect(loaded.input.course).toMatchObject({ name: "AP Chemistry", level: "AP" });
    expect(loaded.input.topics.map((t) => [t.title, t.status])).toEqual([
      ["Moles", "not_enough_evidence"],
      ["Stoichiometry", "not_enough_evidence"],
    ]);
    expect(loaded.input.assessments).toEqual([expect.objectContaining({ id: a.examId, kind: "exam", daysLeft: 6 })]);
    expect(loaded.input.focus.mistake).toMatchObject({ questionId: a.missedId, studentAnswer: "0.5 mol", correctAnswer: "2 mol" });
    expect(loaded.input.syllabus).toEqual({ uploaded: false, via: null });

    const ctx = assembleCourseContext(loaded.input);
    expect(ctx.text).toContain("level AP");
    expect(ctx.text).toContain("No syllabus has been uploaded");
    expect(ctx.text).toContain("The instructor is unknown.");
    expect(ctx.text).toContain("Unit 3 test");
    expect(ctx.text).toContain("Student wrote: 0.5 mol");
  });

  it("never loads another student's course, topics or mistakes", async () => {
    const a = await student("A");
    const b = await student("B");
    const loaded = await loadCourseContext(b.userId, { classId: a.classId, focusQuestionId: a.missedId, focusTopicId: a.stoichId, question: "moles", now: T0, timeZone: "UTC" });
    expect(loaded.input.course).toBeNull();
    expect(loaded.input.topics).toEqual([]);
    expect(loaded.input.mistakes).toEqual([]);
    expect(loaded.input.focus).toEqual({ topic: null, mistake: null });
    // B's own course still works, and A's focus ids don't leak into it.
    const own = await loadCourseContext(b.userId, { classId: b.classId, focusQuestionId: a.missedId, question: "moles", now: T0, timeZone: "UTC" });
    expect(own.input.course?.id).toBe(b.classId);
    expect(own.input.focus.mistake).toBeNull();
  });
});

describe("tutor behaviors with a scripted model (real DB)", { timeout: 90_000 }, () => {
  it("sends the course context and offers course tools only inside a course conversation", async () => {
    const a = await student();
    const loaded = await loadCourseContext(a.userId, { classId: a.classId, question: "help", now: T0, timeZone: "UTC" });
    const { requests } = await turn(a, T0, "help me study", [reply("What part feels shakiest?")], { ...CONTEXT, courseContext: assembleCourseContext(loaded.input).text, hintsFirst: true });
    const system = (requests[0].system as { text: string }[]).map((b) => b.text).join("\n");
    expect(system).toContain("<course_context>");
    expect(system).toContain("hints before full solutions");
    expect(system).toMatch(/ask one short diagnostic question first/);
    expect(system).toMatch(/do not write submission-ready essays/i);
    const names = (requests[0].tools ?? []).map((t) => (t as { name: string }).name);
    expect(names).toEqual(expect.arrayContaining(["ask_check_question", "grade_check_answer", "create_revision_plan", "recommend_prerequisite", "offer_practice_generation", "give_hint"]));

    const noCourse = scriptedTutor([reply("ok")]);
    await runTutorTurn({ client: noCourse.client, scope: { ...scopeFor(a, T0, "hi"), classId: null }, context: CONTEXT, history: [], userText: "hi", onEvent: () => {} });
    expect((noCourse.requests[0].tools ?? []).map((t) => (t as { name: string }).name)).not.toContain("ask_check_question");
  });

  it("records evidence only when a check question is answered in a later message and graded", async () => {
    const a = await student();
    const before = await evidenceCount(a.userId);

    // Turn 1: the tutor asks a check question, then tries to grade it in the same reply.
    const t1 = await turn(a, T0, "quiz me on stoichiometry", [
      toolCall("ask_check_question", { topic_id: a.stoichId, question_id: null }),
      toolCall("grade_check_answer", { check_id: "placeholder", result: "correct" }),
      reply("Here's a question for you."),
    ]);
    const askResult = lastToolResult(t1.requests, 1);
    expect(askResult.content).toContain("Reference answer (do not reveal before they try): 2 mol");
    const check = await db.tutorCheck.findFirstOrThrow({ where: { userId: a.userId } });
    expect(t1.result.cards).toEqual([expect.objectContaining({ type: "check", checkId: check.id, prompt: expect.stringContaining("O2"), hintsAvailable: 2, origin: "STUDENT" })]);
    // The check card never carries the answer.
    expect(JSON.stringify(t1.result.cards)).not.toContain("2 mol");
    expect(lastToolResult(t1.requests, 2).isError).toBe(true);

    // Even with the real check id, grading in the turn that asked it is refused.
    const sameTurn = await turn(a, T0, "quiz me", [toolCall("grade_check_answer", { check_id: check.id, result: "correct" }), reply("…")]);
    expect(lastToolResult(sameTurn.requests, 1)).toMatchObject({ isError: true, content: expect.stringMatching(/hasn't answered/) });
    expect(await evidenceCount(a.userId)).toBe(before);

    // Chat alone never records anything.
    await turn(a, new Date(T0.getTime() + 60_000), "I think stoichiometry is about ratios, right?", [reply("Yes: mole ratios from the balanced equation.")]);
    expect(await evidenceCount(a.userId)).toBe(before);

    // Turn 2: the student asks for a hint (counts against credit), then answers; graded once.
    const t2Time = new Date(T0.getTime() + 2 * 60_000);
    const hint = await turn(a, t2Time, "can I get a hint?", [toolCall("give_hint", { check_id: check.id }), reply("Look at the coefficients.")]);
    expect(lastToolResult(hint.requests, 1).content).toContain("Look at the coefficients.");
    expect(await evidenceCount(a.userId)).toBe(before);

    const t3Time = new Date(T0.getTime() + 3 * 60_000);
    const answer = await turn(a, t3Time, "It's 2 mol of O2 because the ratio is 2:1", [
      toolCall("grade_check_answer", { check_id: check.id, result: "correct" }),
      toolCall("grade_check_answer", { check_id: check.id, result: "correct" }),
      reply("Right: 4 × 1/2 = 2 mol."),
    ]);
    expect(lastToolResult(answer.requests, 1).content).toMatch(/Recorded as correct with 1 hint/);
    expect(lastToolResult(answer.requests, 2)).toMatchObject({ isError: true });
    const evidence = await db.masteryEvidence.findMany({ where: { userId: a.userId, source: "tutor" } });
    expect(evidence).toEqual([
      expect.objectContaining({ result: "CORRECT", hintsUsed: 1, questionId: a.questionId, topicId: a.stoichId, studentAnswer: "It's 2 mol of O2 because the ratio is 2:1" }),
    ]);
    expect(answer.result.cards).toEqual([expect.objectContaining({ type: "graded", result: "CORRECT", hintsUsed: 1, topicTitle: "Stoichiometry" })]);

    // A later message can't grade it again.
    const again = await turn(a, new Date(T0.getTime() + 4 * 60_000), "2 mol", [toolCall("grade_check_answer", { check_id: check.id, result: "correct" }), reply("…")]);
    expect(lastToolResult(again.requests, 1).isError).toBe(true);
    expect(await evidenceCount(a.userId)).toBe(before + 1);

    // Events carry counts only.
    const events = await db.event.findMany({ where: { userId: a.userId, name: "tutor_hint_requested" } });
    expect(events.map((e) => e.properties)).toEqual([{ hint: 1, via: "tutor" }]);
  });

  it("asks for practice generation when the topic has no bank questions", async () => {
    const a = await student();
    const empty = await addTopic(a.userId, a.classId, { title: "Gas laws" });
    if (!empty.ok) throw new Error("setup");
    const t = await turn(a, T0, "quiz me on gas laws", [toolCall("ask_check_question", { topic_id: empty.id, question_id: null }), reply("…")]);
    expect(lastToolResult(t.requests, 1).content).toMatch(/no questions in the student's practice bank/);
    expect(await db.tutorCheck.count({ where: { userId: a.userId } })).toBe(0);
  });

  it("recommends the next prerequisite from learning-core's remediation", async () => {
    const a = await student();
    // Two misses on Stoichiometry make it need review; Moles (its prerequisite) needs review too.
    const s1 = await startSession(a.userId, a.classId, { mode: "mistakes", questionIds: [a.questionId] }, new Date(T0.getTime() - DAY));
    if (!s1.ok) throw new Error("setup");
    await recordAttempt(a.userId, s1.id, { questionId: a.questionId, result: "INCORRECT", hintsUsed: 0 }, new Date(T0.getTime() - DAY));
    const s2 = await startSession(a.userId, a.classId, { mode: "mistakes", questionIds: [a.questionId, a.missedId] }, new Date(T0.getTime() - 3600_000));
    if (!s2.ok) throw new Error("setup");
    await recordAttempt(a.userId, s2.id, { questionId: a.questionId, result: "INCORRECT", hintsUsed: 0 }, new Date(T0.getTime() - 3600_000));
    await recordAttempt(a.userId, s2.id, { questionId: a.missedId, result: "INCORRECT", hintsUsed: 0 }, new Date(T0.getTime() - 3600_000));

    const t = await turn(a, T0, "why do I keep missing these?", [toolCall("recommend_prerequisite", { topic_id: a.stoichId }), reply("Start with moles.")]);
    expect(lastToolResult(t.requests, 1).content).toMatch(/Moles is a prerequisite/);
    expect(t.result.cards).toEqual([expect.objectContaining({ type: "prerequisite", topicTitle: "Stoichiometry", prerequisiteTitle: "Moles" })]);
  });

  it("builds a revision plan for the next exam and schedules it only after the student confirms", async () => {
    const a = await student();
    const t = await turn(a, T0, "make me a plan for my test", [toolCall("create_revision_plan", { exam_id: null }), reply("Here's a plan.")]);
    const card = t.result.cards[0];
    expect(card).toMatchObject({ type: "revision_plan", examId: a.examId, daysLeft: 6, accepted: null });
    if (card.type !== "revision_plan") throw new Error("type");
    expect(card.sessions.length).toBeGreaterThan(0);
    expect(card.notes.join(" ")).toMatch(/doesn't know what the exam actually covers/);
    // Nothing reaches the planner yet.
    expect(await db.scheduleBlock.count({ where: { userId: a.userId } })).toBe(0);
    const created = await db.event.findFirstOrThrow({ where: { userId: a.userId, name: "tutor_revision_plan_created" } });
    expect(Object.keys(created.properties as object).sort()).toEqual(["daysLeft", "sessions", "topics"]);

    const message = await storeReply(a, t.result.cards);
    const pinned: Parameters<PinBlock>[0][] = [];
    const pin: PinBlock = async (block) => {
      pinned.push(block);
      await db.scheduleBlock.create({ data: { userId: a.userId, examId: block.itemId, localDate: block.date, startMinute: block.startMinute, durationMinutes: block.durationMinutes } });
      return { success: true };
    };
    const accepted = await acceptRevisionPlan(a.userId, { conversationId: a.conversationId, messageId: message.id }, pin);
    expect(accepted).toMatchObject({ ok: true, added: card.sessions.length, skipped: 0 });
    expect(pinned.every((b) => b.kind === "exam" && b.itemId === a.examId)).toBe(true);
    expect(await acceptRevisionPlan(a.userId, { conversationId: a.conversationId, messageId: message.id }, pin)).toMatchObject({ ok: false });

    // No exam on file: the tutor is told to say so, not invent one.
    await db.exam.deleteMany({ where: { userId: a.userId } });
    const none = await turn(a, T0, "plan for my exam", [toolCall("create_revision_plan", { exam_id: null }), reply("…")]);
    expect(lastToolResult(none.requests, 1).content).toMatch(/No upcoming exam is on file/);
  });

  it("generates offered practice through learning-core, labeled AI-generated", async () => {
    const a = await student();
    const t = await turn(a, T0, "I need more practice on moles", [toolCall("offer_practice_generation", { topic_id: a.molesId, count: 2 }), reply("Press the button to generate.")]);
    expect(t.result.cards).toEqual([expect.objectContaining({ type: "practice_offer", topicId: a.molesId, count: 2, generated: null })]);
    // Offering generates nothing.
    expect(await db.practiceQuestion.count({ where: { userId: a.userId, origin: "AI_GENERATED" } })).toBe(0);

    const message = await storeReply(a, t.result.cards);
    const generated: GeneratedQuestion[] = [
      { prompt: "How many moles in 44 g of CO2?", answer: "1 mol", explanation: "44 g/mol", hints: ["Molar mass"], difficulty: 2 },
      { prompt: "How many moles in 8 g of O2?", answer: "0.25 mol", explanation: "32 g/mol", hints: [], difficulty: 1 },
    ];
    const provider: GenerationProvider = { generatePracticeQuestions: async () => generated };
    const result = await acceptPracticeOffer(a.userId, { conversationId: a.conversationId, messageId: message.id }, { provider, available: true });
    expect(result).toMatchObject({ ok: true, generated: 2 });
    const questions = await db.practiceQuestion.findMany({ where: { userId: a.userId, origin: "AI_GENERATED" } });
    expect(questions).toHaveLength(2);
    expect(questions.every((q) => q.topicId === a.molesId && q.classId === a.classId)).toBe(true);
    const event = await db.event.findFirstOrThrow({ where: { userId: a.userId, name: "tutor_practice_generated" } });
    expect(event.properties).toEqual({ count: 2 });
    expect(await acceptPracticeOffer(a.userId, { conversationId: a.conversationId, messageId: message.id }, { provider, available: true })).toMatchObject({ ok: false });
  });
});

describe("ownership: another student's ids are rejected", { timeout: 90_000 }, () => {
  it("course tools, hints, checks and card actions never reach another student's data", async () => {
    const a = await student("A");
    const b = await student("B");

    // B's turn, naming A's topic, question, check and exam ids.
    const posed = await turn(a, T0, "quiz", [toolCall("ask_check_question", { topic_id: a.stoichId, question_id: null }), reply("…")]);
    const aCheck = await db.tutorCheck.findFirstOrThrow({ where: { userId: a.userId } });
    expect(posed.result.cards).toHaveLength(1);

    const bTime = new Date(T0.getTime() + 60_000);
    const attempts = [
      toolCall("ask_check_question", { topic_id: a.stoichId, question_id: null }),
      toolCall("ask_check_question", { topic_id: null, question_id: a.questionId }),
      toolCall("give_hint", { check_id: aCheck.id }),
      toolCall("grade_check_answer", { check_id: aCheck.id, result: "correct" }),
      toolCall("recommend_prerequisite", { topic_id: a.stoichId }),
      toolCall("create_revision_plan", { exam_id: a.examId }),
      toolCall("offer_practice_generation", { topic_id: a.molesId, count: 2 }),
    ];
    // Two turns, since a turn allows at most six tool rounds.
    for (const batch of [attempts.slice(0, 4), attempts.slice(4)]) {
      const bTurn = await turn(b, bTime, "2 mol", [...batch, reply("…")]);
      for (let i = 1; i <= batch.length; i++) {
        expect(lastToolResult(bTurn.requests, i).isError).toBe(true);
      }
      expect(bTurn.result.cards).toEqual([]);
    }
    expect(await db.tutorCheck.count({ where: { userId: b.userId } })).toBe(0);
    expect(await db.masteryEvidence.count({ where: { source: "tutor", userId: { in: [a.userId, b.userId] } } })).toBe(0);
    expect(await db.tutorCheck.findUniqueOrThrow({ where: { id: aCheck.id } })).toMatchObject({ hintsUsed: 0, answeredAt: null });

    // A scope that claims A's course and conversation under B's user id finds nothing.
    const forged = scriptedTutor([toolCall("ask_check_question", { topic_id: a.stoichId, question_id: null }), reply("…")]);
    await runTutorTurn({
      client: forged.client,
      scope: { userId: b.userId, classId: a.classId, assignmentId: null, timeZone: "UTC", now: bTime, conversationId: a.conversationId, studentMessage: "x" },
      context: CONTEXT,
      history: [],
      userText: "x",
      onEvent: () => {},
    });
    expect(lastToolResult(forged.requests, 1).isError).toBe(true);

    // The hint button and card actions, with A's ids.
    expect(await takeHint(b.userId, aCheck.id, { via: "button" })).toMatchObject({ ok: false });
    const aMessage = await storeReply(a, [
      { type: "practice_offer", classId: a.classId, topicId: a.molesId, topicTitle: "Moles", count: 1, generated: null },
      { type: "revision_plan", classId: a.classId, examId: a.examId, examTitle: "Unit 3 test", examDate: "2026-10-27", daysLeft: 6, sessions: [{ date: "2026-10-22", startMinute: 1020, minutes: 30, topics: ["Moles"], kind: "focus" }], notes: [], accepted: null },
    ]);
    const pin: PinBlock = async () => {
      throw new Error("must not be called");
    };
    expect(await acceptRevisionPlan(b.userId, { conversationId: a.conversationId, messageId: aMessage.id }, pin)).toMatchObject({ ok: false });
    expect(await acceptRevisionPlan(b.userId, { conversationId: b.conversationId, messageId: aMessage.id }, pin)).toMatchObject({ ok: false });
    expect(await acceptPracticeOffer(b.userId, { conversationId: a.conversationId, messageId: aMessage.id }, { available: true, provider: { generatePracticeQuestions: async () => [] } })).toMatchObject({ ok: false });
  });
});
