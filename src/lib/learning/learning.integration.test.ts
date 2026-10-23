import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import type { GeneratedQuestion } from "@/lib/ai/schemas";
import {
  addPrerequisite,
  addTopic,
  confirmTopics,
  deleteTopic,
  dismissProposedTopics,
  moveTopic,
  proposeTopics,
  removePrerequisite,
  reorderTopics,
  updateTopic,
} from "./topics";
import {
  completeSession,
  createQuestion,
  generateQuestions,
  getMistakes,
  getSession,
  recordAttempt,
  removeQuestion,
  reportQuestion,
  startSession,
  type GenerationProvider,
} from "./practice";
import { getCourseLearning, getLearningOverview } from "./load";
import { DAY_MS } from "./estimator";

// Real database, real services. The AI provider is scripted: no live model is called.

describe("learning core (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function studentWithCourse(name = "AP Calculus AB", subject: string | null = "Math") {
    const user = await createTestUser();
    users.push(user.id);
    const cls = await db.class.create({ data: { userId: user.id, name, subject, color: "#2563eb" } });
    return { userId: user.id, classId: cls.id };
  }

  describe("topic map", () => {
    it("adds, renames, nests, reorders and deletes topics", async () => {
      const { userId, classId } = await studentWithCourse();
      const limits = await addTopic(userId, classId, { title: "Limits" });
      const derivatives = await addTopic(userId, classId, { title: "Derivatives" });
      if (!limits.ok || !derivatives.ok) throw new Error("setup");
      const chain = await addTopic(userId, classId, { title: "Chain rule", parentId: derivatives.id });
      if (!chain.ok) throw new Error("setup");

      expect(await addTopic(userId, classId, { title: "  limits " })).toEqual({ ok: false, error: "This course already has that topic." });
      expect(await addTopic(userId, classId, { title: "Product rule", parentId: chain.id })).toMatchObject({ ok: false });
      expect(await updateTopic(userId, derivatives.id, { parentId: limits.id })).toMatchObject({ ok: false });

      expect(await updateTopic(userId, limits.id, { title: "Limits and continuity" })).toMatchObject({ ok: true });
      expect(await moveTopic(userId, derivatives.id, "up")).toMatchObject({ ok: true });
      const learning = await getCourseLearning(userId, classId);
      expect(learning!.topics.map((t) => t.title)).toEqual(["Derivatives", "Chain rule", "Limits and continuity"]);

      // Deleting a parent keeps its subtopic, now top-level.
      expect(await deleteTopic(userId, derivatives.id)).toMatchObject({ ok: true });
      const after = await db.courseTopic.findUniqueOrThrow({ where: { id: chain.id } });
      expect(after.parentId).toBeNull();
    });

    it("proposed topics wait for confirmation and are skipped when duplicated", async () => {
      const { userId, classId } = await studentWithCourse();
      await addTopic(userId, classId, { title: "Limits" });
      const proposed = await proposeTopics(
        userId,
        classId,
        [{ title: "Limits" }, { title: "Derivatives" }, { title: "Chain rule", parentTitle: "Derivatives" }, { title: "Integrals" }],
        "SYLLABUS",
      );
      if (!proposed.ok) throw new Error(proposed.error);
      expect(proposed.skipped).toBe(1);
      expect(proposed.ids).toHaveLength(3);

      let learning = await getCourseLearning(userId, classId);
      expect(learning!.topics.map((t) => t.title)).toEqual(["Limits"]);
      expect(learning!.proposed.map((t) => t.title)).toEqual(["Derivatives", "Chain rule", "Integrals"]);
      expect(learning!.proposed.every((t) => t.status === "PROPOSED")).toBe(true);

      const integrals = learning!.proposed.find((t) => t.title === "Integrals")!;
      expect(await dismissProposedTopics(userId, classId, [integrals.id])).toEqual({ ok: true, dismissed: 1 });
      expect(await confirmTopics(userId, classId, proposed.ids)).toEqual({ ok: true, confirmed: 2 });
      learning = await getCourseLearning(userId, classId);
      expect(learning!.topics.map((t) => t.title)).toEqual(["Limits", "Derivatives", "Chain rule"]);
      expect(learning!.topics.find((t) => t.title === "Chain rule")!.parentId).toBe(learning!.topics.find((t) => t.title === "Derivatives")!.id);
      expect((await db.courseTopic.findFirstOrThrow({ where: { classId, title: "Derivatives" } })).source).toBe("SYLLABUS");
    });

    it("prerequisites stay in one course and can't form a cycle", async () => {
      const { userId, classId } = await studentWithCourse();
      const other = await db.class.create({ data: { userId, name: "Physics", color: "#000000" } });
      const a = await addTopic(userId, classId, { title: "Functions" });
      const b = await addTopic(userId, classId, { title: "Limits" });
      const c = await addTopic(userId, classId, { title: "Derivatives" });
      const x = await addTopic(userId, other.id, { title: "Kinematics" });
      if (!a.ok || !b.ok || !c.ok || !x.ok) throw new Error("setup");
      expect(await addPrerequisite(userId, b.id, a.id)).toMatchObject({ ok: true });
      expect(await addPrerequisite(userId, c.id, b.id)).toMatchObject({ ok: true });
      expect(await addPrerequisite(userId, a.id, c.id)).toMatchObject({ ok: false, error: expect.stringMatching(/loop/) });
      expect(await addPrerequisite(userId, a.id, a.id)).toMatchObject({ ok: false });
      expect(await addPrerequisite(userId, c.id, x.id)).toMatchObject({ ok: false, error: "Prerequisites must be in the same course." });
      expect(await addPrerequisite(userId, c.id, b.id)).toMatchObject({ ok: false, error: "That prerequisite is already set." });
      expect(await removePrerequisite(userId, c.id, b.id)).toMatchObject({ ok: true });
      expect(await addPrerequisite(userId, a.id, c.id)).toMatchObject({ ok: true });
    });

    it("links evidence from earlier photo checks to a new topic by key", async () => {
      const { userId, classId } = await studentWithCourse();
      await db.masteryEvidence.create({
        data: { userId, classId: null, topicKey: "chain-rule", topicLabel: "Chain rule", score: 0.9, weight: 5, source: "assessment" },
      });
      const topic = await addTopic(userId, classId, { title: "Chain Rule" });
      if (!topic.ok) throw new Error("setup");
      const linked = await db.masteryEvidence.findFirstOrThrow({ where: { userId } });
      expect(linked.topicId).toBe(topic.id);
      const learning = await getCourseLearning(userId, classId);
      expect(learning!.topics[0].estimate.answers).toBe(5);
    });
  });

  describe("practice without AI", () => {
    async function courseWithQuestions() {
      const ctx = await studentWithCourse();
      const topic = await addTopic(ctx.userId, ctx.classId, { title: "Derivatives" });
      if (!topic.ok) throw new Error("setup");
      const ids: string[] = [];
      for (const [prompt, answer] of [["d/dx x^2", "2x"], ["d/dx sin x", "cos x"], ["d/dx e^x", "e^x"]]) {
        const q = await createQuestion(ctx.userId, ctx.classId, { topicId: topic.id, prompt, answer, hints: ["Power rule"], difficulty: 2 });
        if (!q.ok) throw new Error(q.error);
        ids.push(q.id);
      }
      return { ...ctx, topicId: topic.id, questionIds: ids };
    }

    it("runs a session: attempt, mark, evidence, mistakes, summary, events", async () => {
      const { userId, classId, topicId, questionIds } = await courseWithQuestions();
      const started = await startSession(userId, classId, { topicId });
      if (!started.ok) throw new Error(started.error);
      expect(started.questions).toBe(3);
      const view = await getSession(userId, started.id);
      expect(view!.questions.map((q) => q.origin)).toEqual(["STUDENT", "STUDENT", "STUDENT"]);

      const [q1, q2, q3] = view!.questions.map((q) => q.id);
      const r1 = await recordAttempt(userId, started.id, { questionId: q1, result: "CORRECT", hintsUsed: 0, confidence: 3, timeTakenSec: 40 });
      expect(r1).toMatchObject({ ok: true, topicId, before: "not_enough_evidence", after: "not_enough_evidence" });
      await recordAttempt(userId, started.id, { questionId: q2, result: "INCORRECT", hintsUsed: 1, confidence: 3, answer: "-cos x" });
      await recordAttempt(userId, started.id, { questionId: q3, result: "PARTIAL", hintsUsed: 2 });
      expect(await recordAttempt(userId, started.id, { questionId: q1, result: "CORRECT", hintsUsed: 0 })).toMatchObject({ ok: false });

      const evidence = await db.masteryEvidence.findMany({ where: { userId, sessionId: started.id }, orderBy: { createdAt: "asc" } });
      expect(evidence).toHaveLength(3);
      expect(evidence[1]).toMatchObject({ result: "INCORRECT", hintsUsed: 1, confidence: 3, topicId, source: "practice", studentAnswer: "-cos x", difficulty: 2 });

      const done = await completeSession(userId, started.id);
      expect(done).toMatchObject({ ok: true, summary: { attempted: 3, correct: 1, partial: 1, incorrect: 1 } });
      expect(await recordAttempt(userId, started.id, { questionId: q1, result: "CORRECT", hintsUsed: 0 })).toMatchObject({ ok: false });

      const mistakes = await getMistakes(userId, classId);
      expect(mistakes!.map((m) => m.questionId).sort()).toEqual([q2, q3].sort());
      expect(mistakes!.find((m) => m.questionId === q2)).toMatchObject({ studentAnswer: "-cos x", resolved: false, lastResult: "INCORRECT" });

      // Retry the mistakes; getting one right marks it resolved.
      const retry = await startSession(userId, classId, { mode: "mistakes" });
      if (!retry.ok) throw new Error(retry.error);
      const retryView = await getSession(userId, retry.id);
      expect(retryView!.questions.map((q) => q.id).sort()).toEqual([q2, q3].sort());
      await recordAttempt(userId, retry.id, { questionId: q2, result: "CORRECT", hintsUsed: 0 });
      const afterRetry = await getMistakes(userId, classId);
      expect(afterRetry!.find((m) => m.questionId === q2)!.resolved).toBe(true);

      const events = await db.event.findMany({ where: { userId }, select: { name: true, properties: true } });
      const names = events.map((e) => e.name);
      expect(names.filter((n) => n === "practice_session_started")).toHaveLength(2);
      expect(names).toContain("practice_session_completed");
      const completed = events.find((e) => e.name === "practice_session_completed")!;
      expect(completed.properties).toEqual({ attempted: 3, correct: 1, partial: 1, incorrect: 1 });
      expect(questionIds).toHaveLength(3);
    });

    it("mastery changes across separate sessions, logs the change, and fills the review queue", async () => {
      const { userId, classId, topicId } = await courseWithQuestions();
      const now = Date.now();
      // Day 1 (10 days ago): two correct. Day 2 (7 days ago): two correct.
      for (const daysAgo of [10, 7]) {
        const when = new Date(now - daysAgo * DAY_MS);
        const s = await startSession(userId, classId, { topicId }, when);
        if (!s.ok) throw new Error(s.error);
        const v = await getSession(userId, s.id);
        for (const q of v!.questions.slice(0, 2)) {
          await recordAttempt(userId, s.id, { questionId: q.id, result: "CORRECT", hintsUsed: 0 }, new Date(when.getTime() + 60_000));
        }
        await completeSession(userId, s.id, new Date(when.getTime() + 120_000));
      }
      const changes = await db.event.findMany({ where: { userId, name: "topic_mastery_changed" }, select: { properties: true } });
      expect(changes.map((c) => c.properties)).toContainEqual({ from: "not_enough_evidence", to: "developing" });
      for (const c of changes) expect(Object.keys(c.properties as object).sort()).toEqual(["from", "to"]);

      const learning = await getCourseLearning(userId, classId);
      const t = learning!.topics.find((x) => x.id === topicId)!;
      expect(t.estimate.sessions).toBe(2);
      // 3-day interval after the second spaced success, 7 days ago: due now.
      expect(t.estimate.due).toBe(true);
      expect(learning!.review.map((r) => r.topicId)).toEqual([topicId]);
      const overview = await getLearningOverview(userId);
      expect(overview.review.map((r) => r.topicId)).toEqual([topicId]);

      // The day -7 session was already a review (due after 1 day); answering while due now is another.
      expect(await db.event.count({ where: { userId, name: "review_completed" } })).toBe(1);
      const s = await startSession(userId, classId, { topicId });
      if (!s.ok) throw new Error(s.error);
      const v = await getSession(userId, s.id);
      await recordAttempt(userId, s.id, { questionId: v!.questions[0].id, result: "CORRECT", hintsUsed: 0 });
      await completeSession(userId, s.id);
      expect(await db.event.count({ where: { userId, name: "review_completed" } })).toBe(2);
    });

    it("refuses to start a session with nothing to practice", async () => {
      const { userId, classId } = await studentWithCourse();
      expect(await startSession(userId, classId)).toMatchObject({ ok: false });
    });

    it("removing or reporting a question hides it but keeps the history", async () => {
      const { userId, classId, questionIds } = await courseWithQuestions();
      expect(await removeQuestion(userId, questionIds[0])).toMatchObject({ ok: true });
      expect(await reportQuestion(userId, questionIds[1], "wrong_answer", "The answer is off")).toMatchObject({ ok: true });
      const visible = await db.practiceQuestion.count({ where: { userId, classId, hiddenAt: null } });
      expect(visible).toBe(1);
      expect(await db.questionReport.count({ where: { userId, questionId: questionIds[1] } })).toBe(1);
      expect(await db.event.count({ where: { userId, name: "question_reported" } })).toBe(1);
      const s = await startSession(userId, classId);
      if (!s.ok) throw new Error(s.error);
      expect(s.questions).toBe(1);
    });
  });

  describe("generated questions (scripted provider)", () => {
    const questions: GeneratedQuestion[] = [
      { prompt: "Differentiate x^3", answer: "3x^2", explanation: "Power rule.", hints: ["Bring the exponent down"], difficulty: 1 },
      { prompt: "Differentiate sin(2x)", answer: "2cos(2x)", explanation: null, hints: [], difficulty: 2 },
    ];
    function scripted(output: GeneratedQuestion[] | null) {
      const calls: unknown[] = [];
      const provider: GenerationProvider = {
        async generatePracticeQuestions(input, onUsage) {
          calls.push(input);
          onUsage?.({ model: "claude-opus-5-5", inputTokens: 500, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 });
          return output;
        },
      };
      return { provider, calls };
    }

    it("stores generated questions labeled as AI-generated, with grounding noted and usage metered", async () => {
      const { userId, classId } = await studentWithCourse();
      const topic = await addTopic(userId, classId, { title: "Chain rule" });
      if (!topic.ok) throw new Error("setup");
      const { provider, calls } = scripted(questions);
      const result = await generateQuestions(userId, classId, topic.id, { provider, available: true, count: 2 });
      if (!result.ok) throw new Error(result.error);
      const stored = await db.practiceQuestion.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
      expect(stored).toHaveLength(2);
      expect(stored.every((q) => q.origin === "AI_GENERATED" && q.topicId === topic.id)).toBe(true);
      expect(stored[0].sourceNote).toMatch(/topic name only/);
      expect(stored[0].format).toBe("worked_problem");
      expect(calls[0]).toMatchObject({ topic: "Chain rule", courseName: "AP Calculus AB", count: 2 });
      const usage = await db.aiUsage.findFirstOrThrow({ where: { userId } });
      expect(usage).toMatchObject({ feature: "practice_questions", status: "completed" });
    });

    it("without AI, says it's not available and changes nothing", async () => {
      const { userId, classId } = await studentWithCourse();
      const topic = await addTopic(userId, classId, { title: "Chain rule" });
      if (!topic.ok) throw new Error("setup");
      const result = await generateQuestions(userId, classId, topic.id, { available: false });
      expect(result).toEqual({ ok: false, error: "Generated questions aren't available yet. You can still add your own." });
      expect(await db.aiUsage.count({ where: { userId } })).toBe(0);
    });

    it("a provider failure is recorded as failed and nothing is stored", async () => {
      const { userId, classId } = await studentWithCourse();
      const topic = await addTopic(userId, classId, { title: "Chain rule" });
      if (!topic.ok) throw new Error("setup");
      const { provider } = scripted(null);
      expect(await generateQuestions(userId, classId, topic.id, { provider, available: true })).toMatchObject({ ok: false });
      expect(await db.practiceQuestion.count({ where: { userId } })).toBe(0);
      expect((await db.aiUsage.findFirstOrThrow({ where: { userId } })).status).toBe("failed");
    });
  });

  describe("ownership: another student's ids never work", () => {
    it("every topic, question, session and report function refuses foreign ids", async () => {
      const owner = await studentWithCourse();
      const attacker = await studentWithCourse("Attacker course");
      const topic = await addTopic(owner.userId, owner.classId, { title: "Limits" });
      const topic2 = await addTopic(owner.userId, owner.classId, { title: "Functions" });
      if (!topic.ok || !topic2.ok) throw new Error("setup");
      const attackerTopic = await addTopic(attacker.userId, attacker.classId, { title: "Mine" });
      if (!attackerTopic.ok) throw new Error("setup");
      await addPrerequisite(owner.userId, topic.id, topic2.id);
      const question = await createQuestion(owner.userId, owner.classId, { topicId: topic.id, prompt: "lim x->0 sin x / x", answer: "1" });
      if (!question.ok) throw new Error("setup");
      const session = await startSession(owner.userId, owner.classId);
      if (!session.ok) throw new Error("setup");
      const proposed = await proposeTopics(owner.userId, owner.classId, [{ title: "Integrals" }], "TEMPLATE");
      if (!proposed.ok) throw new Error("setup");

      const a = attacker.userId;
      // Topics
      expect(await addTopic(a, owner.classId, { title: "x" })).toMatchObject({ ok: false });
      expect(await addTopic(a, attacker.classId, { title: "x", parentId: topic.id })).toMatchObject({ ok: false });
      expect(await updateTopic(a, topic.id, { title: "Hijacked" })).toMatchObject({ ok: false });
      expect(await updateTopic(a, attackerTopic.id, { parentId: topic.id })).toMatchObject({ ok: false });
      expect(await moveTopic(a, topic.id, "down")).toMatchObject({ ok: false });
      expect(await reorderTopics(a, owner.classId, [topic2.id, topic.id])).toMatchObject({ ok: false });
      expect(await reorderTopics(a, attacker.classId, [topic2.id, topic.id])).toEqual({ ok: true, updated: 0 });
      expect(await deleteTopic(a, topic.id)).toMatchObject({ ok: false });
      expect(await proposeTopics(a, owner.classId, [{ title: "x" }], "STUDENT")).toMatchObject({ ok: false });
      expect(await confirmTopics(a, owner.classId, proposed.ids)).toMatchObject({ ok: false });
      expect(await confirmTopics(a, attacker.classId, proposed.ids)).toEqual({ ok: true, confirmed: 0 });
      expect(await dismissProposedTopics(a, owner.classId, proposed.ids)).toEqual({ ok: true, dismissed: 0 });
      expect(await addPrerequisite(a, topic.id, topic2.id)).toMatchObject({ ok: false });
      expect(await addPrerequisite(a, attackerTopic.id, topic.id)).toMatchObject({ ok: false });
      expect(await removePrerequisite(a, topic.id, topic2.id)).toMatchObject({ ok: false });
      // Practice
      expect(await createQuestion(a, owner.classId, { prompt: "x", answer: "y" })).toMatchObject({ ok: false });
      expect(await createQuestion(a, attacker.classId, { topicId: topic.id, prompt: "x", answer: "y" })).toMatchObject({ ok: false });
      expect(await removeQuestion(a, question.id)).toMatchObject({ ok: false });
      expect(await reportQuestion(a, question.id, "unclear")).toMatchObject({ ok: false });
      expect(await startSession(a, owner.classId)).toMatchObject({ ok: false });
      expect(await startSession(a, attacker.classId, { topicId: topic.id })).toMatchObject({ ok: false });
      expect(await startSession(a, attacker.classId, { mode: "mistakes", questionIds: [question.id] })).toMatchObject({ ok: false });
      expect(await getSession(a, session.id)).toBeNull();
      expect(await recordAttempt(a, session.id, { questionId: question.id, result: "CORRECT", hintsUsed: 0 })).toMatchObject({ ok: false });
      expect(await completeSession(a, session.id)).toMatchObject({ ok: false });
      expect(await getMistakes(a, owner.classId)).toBeNull();
      expect(await getCourseLearning(a, owner.classId)).toBeNull();
      const { provider } = { provider: { generatePracticeQuestions: async () => [] } satisfies GenerationProvider };
      expect(await generateQuestions(a, owner.classId, topic.id, { provider, available: true })).toMatchObject({ ok: false });
      expect(await generateQuestions(a, attacker.classId, topic.id, { provider, available: true })).toMatchObject({ ok: false });
      // An attacker's own session can't record answers to the owner's question.
      const own = await createQuestion(a, attacker.classId, { prompt: "mine", answer: "mine" });
      if (!own.ok) throw new Error("setup");
      const attackerSession = await startSession(a, attacker.classId);
      if (!attackerSession.ok) throw new Error("setup");
      expect(await recordAttempt(a, attackerSession.id, { questionId: question.id, result: "CORRECT", hintsUsed: 0 })).toMatchObject({ ok: false });

      // Nothing of the owner's changed.
      expect(await db.courseTopic.findUniqueOrThrow({ where: { id: topic.id } })).toMatchObject({ title: "Limits" });
      expect(await db.courseTopic.count({ where: { userId: owner.userId } })).toBe(3);
      expect(await db.courseTopic.findUniqueOrThrow({ where: { id: proposed.ids[0] } })).toMatchObject({ status: "PROPOSED" });
      expect(await db.topicPrerequisite.count({ where: { userId: owner.userId } })).toBe(1);
      expect(await db.practiceQuestion.findUniqueOrThrow({ where: { id: question.id } })).toMatchObject({ hiddenAt: null });
      expect(await db.questionReport.count({ where: { questionId: question.id } })).toBe(0);
      expect(await db.masteryEvidence.count({ where: { userId: owner.userId } })).toBe(0);
      expect(await db.practiceSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ completedAt: null });
      expect(await db.aiUsage.count({ where: { userId: a } })).toBe(0);
    });
  });
});
