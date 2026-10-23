import { describe, it, expect } from "vitest";
import { scoreItem, scoreAndRank } from "./score";
import { explainScore, masteryPhrase } from "./explain";
import { applyMasteryToExam, buildReviewWorkItems, prepFactor, summarizeMastery } from "./mastery-inputs";
import { DAY_MS, estimateTopic, type Observation } from "@/lib/learning/estimator";
import type { MasterySummary, WorkItem } from "./types";

const NOW = new Date("2026-10-22T15:00:00Z");
const TZ = "UTC";

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    kind: "assignment",
    id: "a1",
    classId: "c1",
    title: "Lab report",
    className: "Chemistry",
    classColor: "#000000",
    priority: "MEDIUM",
    classPriority: "MEDIUM",
    dueAt: new Date("2026-10-29T15:00:00Z"),
    remainingMinutes: 60,
    rawEstimatedMinutes: 60,
    estimateAdjusted: false,
    ...overrides,
  };
}

const mastery = (m: Partial<MasterySummary>): MasterySummary => {
  const base = { secure: 0, developing: 0, needsReview: 0, unknown: 0, ...m };
  return { ...base, total: base.secure + base.developing + base.needsReview + base.unknown };
};

const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const obs = (d: number, score: number, session = `s${d}`): Observation => ({ at: ago(d), score, items: 1, sessionKey: session });

describe("assessment importance", () => {
  it("adds nothing when the caller doesn't model weights (the public tools)", () => {
    const exam = scoreItem(makeItem({ kind: "exam" }), NOW, TZ);
    expect(exam.breakdown.assessmentWeight).toBe(0);
    expect(exam.breakdown.masteryGap).toBe(0);
    expect(exam.breakdown.reviewUrgency).toBe(0);
  });

  it("uses the grade weight when known, capped, and leads with it when it's large", () => {
    const heavy = scoreItem(makeItem({ weightPercent: 30, dueAt: new Date("2026-11-15T15:00:00Z") }), NOW, TZ);
    expect(heavy.breakdown.assessmentWeight).toBe(18);
    expect(heavy.reasonCode).toBe("HIGH_WEIGHT");
    const huge = scoreItem(makeItem({ weightPercent: 90 }), NOW, TZ);
    expect(huge.breakdown.assessmentWeight).toBe(24);
    const light = scoreItem(makeItem({ weightPercent: 5 }), NOW, TZ);
    expect(light.breakdown.assessmentWeight).toBe(3);
  });

  it("an exam with an unknown weight outranks the same homework; known weights win over the default", () => {
    const homework = makeItem({ id: "hw", weightPercent: null });
    const exam = makeItem({ id: "ex", kind: "exam", weightPercent: null, dueAt: new Date("2026-11-20T15:00:00Z") });
    const sameHomework = makeItem({ id: "hw2", weightPercent: null, dueAt: new Date("2026-11-20T15:00:00Z") });
    expect(scoreItem(exam, NOW, TZ).score).toBeGreaterThan(scoreItem(sameHomework, NOW, TZ).score);
    expect(scoreItem(homework, NOW, TZ).breakdown.assessmentWeight).toBe(0);
    expect(scoreItem(makeItem({ kind: "exam", weightPercent: 40 }), NOW, TZ).breakdown.assessmentWeight).toBe(24);
  });
});

describe("mastery-weighted exam prep", () => {
  it("prep factor grows with weak or unknown topics, shrinks when secure, and stays bounded", () => {
    expect(prepFactor(mastery({}))).toBe(1);
    expect(prepFactor(mastery({ needsReview: 4 }))).toBe(1.5);
    expect(prepFactor(mastery({ secure: 4 }))).toBe(0.75);
    expect(prepFactor(mastery({ unknown: 4 }))).toBe(1.25);
    expect(prepFactor(mastery({ needsReview: 2, secure: 2 }))).toBe(1.13);
    expect(prepFactor(mastery({ needsReview: 2, developing: 1, secure: 1 }))).toBeGreaterThan(prepFactor(mastery({ needsReview: 1, developing: 1, secure: 2 })));
  });

  it("scales only exams, rounds to 5 minutes, and records the base for the explanation", () => {
    const exam = applyMasteryToExam(makeItem({ kind: "exam", remainingMinutes: 120 }), mastery({ needsReview: 2, developing: 1, secure: 1 }));
    expect(exam.remainingMinutes).toBe(150); // 1 + (0.5·2 + 0.25·1 − 0.25·1) / 4 = 1.25
    expect(exam.prep).toEqual({ baseMinutes: 120, factor: 1.25, mastery: mastery({ needsReview: 2, developing: 1, secure: 1 }) });
    const assignment = applyMasteryToExam(makeItem({ remainingMinutes: 60 }), mastery({ needsReview: 2 }));
    expect(assignment.remainingMinutes).toBe(60);
    expect(applyMasteryToExam(makeItem({ kind: "exam" }), mastery({})).prep).toBeUndefined();
  });

  it("the mastery gap pulls an approaching exam up, and only within two weeks", () => {
    const weak = mastery({ needsReview: 2, secure: 2 });
    const near = scoreItem(makeItem({ kind: "exam", mastery: weak, dueAt: new Date("2026-10-27T15:00:00Z") }), NOW, TZ);
    const nearSecure = scoreItem(makeItem({ kind: "exam", mastery: mastery({ secure: 4 }), dueAt: new Date("2026-10-27T15:00:00Z") }), NOW, TZ);
    const mid = scoreItem(makeItem({ kind: "exam", mastery: weak, dueAt: new Date("2026-11-02T15:00:00Z") }), NOW, TZ);
    const far = scoreItem(makeItem({ kind: "exam", mastery: weak, dueAt: new Date("2026-11-20T15:00:00Z") }), NOW, TZ);
    expect(near.breakdown.masteryGap).toBe(10);
    expect(nearSecure.breakdown.masteryGap).toBe(0);
    expect(mid.breakdown.masteryGap).toBe(5);
    expect(far.breakdown.masteryGap).toBe(0);
    expect(near.score).toBeGreaterThan(nearSecure.score);
  });

  it("explains exam prep with the real topic counts", () => {
    const exam = applyMasteryToExam(
      makeItem({ kind: "exam", title: "Unit 3 test", remainingMinutes: 120, dueAt: new Date("2026-10-27T15:00:00Z") }),
      mastery({ needsReview: 2, secure: 2 }),
    );
    const reasons = explainScore(scoreItem(exam, NOW, TZ), NOW, undefined, TZ);
    expect(reasons[0]).toBe("Exam in 5 days and 2 of 4 topics need review.");
    expect(reasons).toContain("Prep is 2h 15m, up from 2h, because 2 of 4 topics need review.");
    const secure = applyMasteryToExam(makeItem({ kind: "exam", remainingMinutes: 120, dueAt: new Date("2026-10-27T15:00:00Z") }), mastery({ secure: 3 }));
    const secureReasons = explainScore(scoreItem(secure, NOW, TZ), NOW, undefined, TZ);
    expect(secureReasons[0]).toBe("Exam in 5 days; all 3 topics look secure.");
    expect(secureReasons).toContain("Prep is 1h 30m, down from 2h, because all 3 topics look secure.");
  });

  it("phrases mastery summaries without inventing anything", () => {
    expect(masteryPhrase(mastery({}))).toBeNull();
    expect(masteryPhrase(mastery({ needsReview: 1, secure: 3 }))).toBe("1 of 4 topics needs review");
    expect(masteryPhrase(mastery({ developing: 2, secure: 1 }))).toBe("2 of 3 topics are still developing");
    expect(masteryPhrase(mastery({ unknown: 1 }))).toBe("all 1 topic has too little practice to judge");
  });
});

describe("review blocks", () => {
  const courses = [
    { id: "c1", name: "Chemistry", color: "#111111", priority: "MEDIUM" as const },
    { id: "c2", name: "History", color: "#222222", priority: "HIGH" as const },
  ];
  const topics = [
    // Recalled cleanly three times, last 9 days ago: developing and due.
    { topicId: "t1", classId: "c1", title: "Stoichiometry", estimate: estimateTopic([obs(20, 1), obs(16, 1), obs(9, 1)], NOW) },
    // Mostly wrong: needs review, due.
    { topicId: "t2", classId: "c1", title: "Gas laws", estimate: estimateTopic([obs(10, 0), obs(6, 1), obs(5, 0), obs(4, 0)], NOW) },
    // Fresh: not due.
    { topicId: "t3", classId: "c2", title: "Treaties", estimate: estimateTopic([obs(2, 1), obs(1, 1)], NOW) },
    // Never practiced: never in the queue.
    { topicId: "t4", classId: "c2", title: "Empires", estimate: estimateTopic([], NOW) },
  ];

  it("groups due topics into one block per course with a sensible length", () => {
    const items = buildReviewWorkItems({ topics, courses, examDaysByClass: new Map([["c1", 5]]), now: NOW, timeZone: TZ });
    expect(items).toHaveLength(1);
    const [review] = items;
    expect(review.kind).toBe("review");
    expect(review.id).toBe("c1");
    expect(review.soft).toBe(true);
    expect(review.review?.topics.map((t) => t.title).sort()).toEqual(["Gas laws", "Stoichiometry"]);
    expect(review.remainingMinutes).toBe(30); // 20 (needs review) + 10
    expect(review.title).toMatch(/^Review: /);
    expect(review.review?.examDaysAway).toBe(5);
    // Planned within the review window (the next three days).
    expect(review.dueAt.toISOString()).toBe("2026-10-24T23:59:00.000Z");
  });

  it("scores reviews between near deadlines and far-off work, and explains them by recall", () => {
    const [review] = buildReviewWorkItems({ topics, courses, examDaysByClass: new Map([["c1", 5]]), now: NOW, timeZone: TZ });
    const scoredReview = scoreItem(review, NOW, TZ);
    expect(scoredReview.reasonCode).toBe("REVIEW_DUE");
    expect(scoredReview.breakdown.reviewUrgency).toBeGreaterThanOrEqual(30);
    expect(scoredReview.breakdown.reviewUrgency).toBeLessThanOrEqual(70);
    const dueTomorrow = makeItem({ id: "soon", dueAt: new Date("2026-10-23T15:00:00Z") });
    const dueInTenDays = makeItem({ id: "far", dueAt: new Date("2026-11-01T15:00:00Z") });
    const ranked = scoreAndRank([dueInTenDays, review, dueTomorrow], NOW, TZ).map((s) => s.item.id);
    expect(ranked).toEqual(["soon", "c1", "far"]);

    const reasons = explainScore(scoredReview, NOW, undefined, TZ);
    expect(reasons.some((r) => r === "Review due: Stoichiometry, last recalled 9 days ago.")).toBe(true);
    expect(reasons.some((r) => /^Review due: Gas laws, last recalled 6 days ago\. It may be slipping\.$/.test(r))).toBe(true);
    expect(reasons).toContain("Chemistry has an exam in 5 days.");
  });

  it("caps the number of topics and the minutes per block", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      topicId: `m${i}`,
      classId: "c1",
      title: `Topic ${i}`,
      estimate: estimateTopic([obs(30 + i, 0, `a${i}`), obs(20 + i, 0, `b${i}`)], NOW),
    }));
    const [review] = buildReviewWorkItems({ topics: many, courses, examDaysByClass: new Map(), now: NOW, timeZone: TZ });
    expect(review.review?.topics).toHaveLength(4);
    expect(review.remainingMinutes).toBe(45);
    expect(review.title).toMatch(/\+2$/);
  });

  it("summarizes statuses", () => {
    expect(summarizeMastery(["secure", "developing", "needs_review", "not_enough_evidence", "secure"])).toEqual({
      total: 5,
      secure: 2,
      developing: 1,
      needsReview: 1,
      unknown: 1,
    });
  });
});

describe("observed pace", () => {
  it("explains an estimate adjusted by the student's own sessions", () => {
    const item = makeItem({ remainingMinutes: 84, rawEstimatedMinutes: 60, estimateAdjusted: true, estimateNote: { percentOff: 40, sampleSize: 5, source: "class" } });
    const reasons = explainScore(scoreItem(item, NOW, TZ), NOW, undefined, TZ);
    expect(reasons).toContain("Your Chemistry work has taken about 40% longer than planned (5 sessions), so it gets 1h 24m instead of 1h.");
  });
});
