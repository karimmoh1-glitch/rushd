import { describe, it, expect } from "vitest";
import { assessReadiness, coursesToSuggestArchiving, dateColumnKey, pickBiggestGap, type GapCandidate, type ReadinessTopic } from "./outcomes";
import { nextWeekStart, overrideRisk } from "./overrides";
import { DAY_MS, estimateTopic, type Observation } from "@/lib/learning/estimator";

const NOW = new Date("2026-10-22T15:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const obs = (d: number, score: number, session = `s${d}`): Observation => ({ at: ago(d), score, items: 1, sessionKey: session });

// Evidence shapes with known estimator outcomes.
const SECURE = [obs(9, 1, "a"), obs(9, 1, "a"), obs(6, 1, "b"), obs(2, 1, "c"), obs(2, 1, "c")];
const NEEDS_REVIEW = [obs(6, 0, "a"), obs(5, 0, "b"), obs(4, 0, "c"), obs(3, 1, "d")];
const DEVELOPING = [obs(1, 1, "a"), obs(1, 0, "a"), obs(1, 1, "a"), obs(1, 1, "a")];
const NONE: Observation[] = [];

const topic = (id: string, history: Observation[]): ReadinessTopic => ({ id, title: id, estimate: estimateTopic(history, NOW) });

describe("assessReadiness", () => {
  const base = { className: "Chemistry", daysLeft: 5, plannedPrepMinutes: 120, neededPrepMinutes: 120, shortMinutes: 0 };

  it("can't tell without topics, and says what would help", () => {
    const r = assessReadiness({ ...base, topics: [] });
    expect(r.level).toBe("no_topics");
    expect(r.confidence).toBeNull();
    expect(r.improve[0]).toMatch(/Add the topics this exam covers/);
  });

  it("says not enough evidence when under half the topics have been practiced", () => {
    const r = assessReadiness({ ...base, topics: [topic("Limits", SECURE), topic("Derivatives", NONE), topic("Integrals", NONE)] });
    expect(r.level).toBe("not_enough_evidence");
    expect(r.label).toBe("Not enough evidence");
    expect(r.summary).toBe("You've practiced 1 of 3 topics; that's too little to say how ready you are.");
    expect(r.improve[0]).toBe("Practice Derivatives and Integrals: no answers yet.");
  });

  it("is at risk when a third of the topics need review, or prep doesn't fit", () => {
    const weak = assessReadiness({ ...base, topics: [topic("A", NEEDS_REVIEW), topic("B", SECURE), topic("C", DEVELOPING)] });
    expect(weak.level).toBe("at_risk");
    expect(weak.improve).toContain("Review A.");
    const short = assessReadiness({ ...base, shortMinutes: 45, topics: [topic("A", SECURE), topic("B", SECURE)] });
    expect(short.level).toBe("at_risk");
    expect(short.improve).toContain("Find 45 min more for prep before the exam, or move lighter work.");
  });

  it("looks on track only with mostly secure topics and nothing needing review", () => {
    const r = assessReadiness({ ...base, topics: [topic("A", SECURE), topic("B", SECURE), topic("C", DEVELOPING)] });
    expect(r.level).toBe("on_track");
    expect(r.summary).toBe("Of 3 topics: 2 secure, 1 developing. 2h of 2h prep is planned.");
    expect(r.confidence).not.toBeNull();
  });

  it("is getting there in between, and never claims more confidence than the evidence", () => {
    const r = assessReadiness({ ...base, topics: [topic("A", SECURE), topic("B", DEVELOPING), topic("C", DEVELOPING), topic("D", NONE)] });
    expect(r.level).toBe("getting_there");
    expect(r.confidence).toBe("low"); // one-sitting topics are low confidence
    expect(r.improve).toContain("Answer again on a different day: one sitting can't confirm a topic.");
  });
});

describe("pickBiggestGap", () => {
  const candidate = (id: string, classId: string, history: Observation[]): GapCandidate => ({
    topicId: id,
    title: id,
    classId,
    className: classId === "c1" ? "Chemistry" : "History",
    classColor: "#000",
    estimate: estimateTopic(history, NOW),
    remediation: null,
  });

  it("returns nothing without evidence of a weak spot", () => {
    expect(pickBiggestGap([candidate("A", "c1", NONE), candidate("B", "c1", SECURE)], new Map())).toBeNull();
  });

  it("prefers the weakest topic, then the one whose exam is soonest", () => {
    const gap = pickBiggestGap(
      [candidate("Dev", "c1", DEVELOPING), candidate("Weak", "c2", NEEDS_REVIEW), candidate("Weak soon", "c1", NEEDS_REVIEW)],
      new Map([["c1", 4]]),
    );
    expect(gap?.title).toBe("Weak soon");
    expect(gap?.examDays).toBe(4);
    expect(gap?.reason).toMatch(/Chemistry has an exam in 4 days\.$/);
  });

  it("an exam this week can lift a developing topic above an unrelated weak one", () => {
    const gap = pickBiggestGap([candidate("Dev", "c1", DEVELOPING), candidate("Weak", "c2", NEEDS_REVIEW)], new Map([["c1", 2]]));
    expect(gap?.title).toBe("Dev");
  });
});

describe("archive suggestions", () => {
  const course = (over: Partial<Parameters<typeof coursesToSuggestArchiving>[0][number]>) => ({
    id: "c1",
    name: "Chemistry",
    archived: false,
    termEnd: "2026-10-20",
    archiveSuggestionDismissedAt: null,
    ...over,
  });

  it("asks only about active courses whose term has ended and that weren't waved off", () => {
    const today = "2026-10-22";
    expect(coursesToSuggestArchiving([course({})], today).map((c) => c.id)).toEqual(["c1"]);
    expect(coursesToSuggestArchiving([course({ termEnd: "2026-10-22" })], today)).toEqual([]); // last day of term: not yet
    expect(coursesToSuggestArchiving([course({ termEnd: null })], today)).toEqual([]);
    expect(coursesToSuggestArchiving([course({ archived: true })], today)).toEqual([]);
    expect(coursesToSuggestArchiving([course({ archiveSuggestionDismissedAt: new Date() })], today)).toEqual([]);
  });

  it("reads @db.Date columns as calendar days", () => {
    expect(dateColumnKey(new Date("2026-12-18T00:00:00.000Z"))).toBe("2026-12-18");
    expect(dateColumnKey(null)).toBeNull();
  });
});

describe("overrides", () => {
  it("not this week resumes on the next Monday", () => {
    expect(nextWeekStart("2026-10-22")).toBe("2026-10-26"); // Thursday
    expect(nextWeekStart("2026-10-26")).toBe("2026-11-02"); // Monday -> the following Monday
    expect(nextWeekStart("2026-10-25")).toBe("2026-10-26"); // Sunday
  });

  it("names the risk an override created, and only for that item", () => {
    const warnings = [
      { type: "DEADLINE_SHORTFALL" as const, itemId: "a1", kind: "assignment" as const, title: "Lab report", className: "Chemistry", dueAt: new Date("2026-10-23T23:00:00Z"), overdue: false, shortMinutes: 45, override: "skip" as const },
    ];
    expect(overrideRisk({ warnings }, { kind: "assignment", itemId: "a1" }, "UTC", NOW)).toMatch(/^Heads up: Lab report is now 45 min short before it's due/);
    expect(overrideRisk({ warnings }, { kind: "assignment", itemId: "a2" }, "UTC", NOW)).toBeUndefined();
    expect(overrideRisk({ warnings }, { kind: "exam", itemId: "a1" }, "UTC", NOW)).toBeUndefined();
  });
});
