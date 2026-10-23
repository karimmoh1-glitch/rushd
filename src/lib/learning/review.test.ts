import { describe, it, expect } from "vitest";
import { DAY_MS, estimateTopic, type Observation } from "./estimator";
import { reviewQueue, type ReviewCandidate } from "./review";
import { recommendRemediation, wouldCreateCycle } from "./graph";

const NOW = new Date("2026-10-22T18:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const o = (d: number, score: number, extra: Partial<Observation> = {}): Observation => ({
  at: ago(d),
  score,
  items: 1,
  sessionKey: `s${d}`,
  ...extra,
});

function candidate(topicId: string, history: Observation[]): ReviewCandidate {
  return { topicId, classId: "c1", title: topicId, estimate: estimateTopic(history, NOW) };
}

describe("reviewQueue", () => {
  it("lists only due topics, most overdue (relative to interval) first", () => {
    const fresh = candidate("fresh", [o(3, 1), o(1, 1)]);
    const slightly = candidate("slightly", [o(6, 1), o(4.5, 1)]); // interval 3 days from 4.5 days ago
    const long = candidate("long", [o(40, 1), o(30, 1)]);
    const queue = reviewQueue([fresh, slightly, long], NOW);
    expect(queue.map((q) => q.topicId)).toEqual(["long", "slightly"]);
    expect(queue[0].reason).toMatch(/Last correct 30 days ago/);
  });

  it("a horizon includes topics coming due soon, and limit caps the list", () => {
    const fresh = candidate("fresh", [o(3, 1), o(1, 1)]);
    expect(reviewQueue([fresh], NOW)).toEqual([]);
    const soon = reviewQueue([fresh], NOW, { horizonDays: 7 });
    expect(soon).toHaveLength(1);
    expect(soon[0].overdueDays).toBeLessThan(0);
    const many = [candidate("a", [o(9, 1)]), candidate("b", [o(8, 1)]), candidate("c", [o(7, 1)])];
    expect(reviewQueue(many, NOW, { limit: 2 })).toHaveLength(2);
  });

  it("skips topics with no evidence", () => {
    expect(reviewQueue([candidate("empty", [])], NOW)).toEqual([]);
  });

  it("a missed answer brings the topic back the next day", () => {
    const missed = candidate("missed", [o(1.2, 0)]);
    const queue = reviewQueue([missed], NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].reason).toMatch(/haven't answered it cleanly/);
  });
});

describe("prerequisite graph", () => {
  const edges = [
    { topicId: "chain", prerequisiteId: "derivatives" },
    { topicId: "derivatives", prerequisiteId: "limits" },
    { topicId: "derivatives", prerequisiteId: "functions" },
  ];

  it("refuses edges that would make a cycle", () => {
    expect(wouldCreateCycle(edges, "limits", "chain")).toBe(true);
    expect(wouldCreateCycle(edges, "limits", "derivatives")).toBe(true);
    expect(wouldCreateCycle(edges, "x", "x")).toBe(true);
    expect(wouldCreateCycle(edges, "chain", "functions")).toBe(false);
  });

  const topics = [
    { id: "chain", title: "Chain rule" },
    { id: "derivatives", title: "Derivatives" },
    { id: "limits", title: "Limits" },
    { id: "functions", title: "Functions" },
  ];
  const struggling = estimateTopic([o(3, 0), o(2, 0), o(1, 0.5)], NOW);
  const secure = estimateTopic([o(12, 1), o(9, 1), o(1, 1), o(1, 1, { sessionKey: "s1" })], NOW);
  const weak = estimateTopic([o(3, 0), o(1, 0)], NOW);

  it("recommends the weakest prerequisite first, with the reason", () => {
    const estimates = new Map([
      ["chain", struggling],
      ["derivatives", secure],
      ["limits", weak],
      ["functions", secure],
    ]);
    const r = recommendRemediation("chain", topics, edges, estimates);
    expect(r).toMatchObject({ kind: "prerequisite", topicId: "limits", depth: 2 });
    if (r?.kind === "prerequisite") expect(r.reason).toMatch(/Limits is a prerequisite .*needs review/);
  });

  it("points at unpracticed prerequisites when none are known weak", () => {
    const estimates = new Map([
      ["chain", struggling],
      ["derivatives", secure],
      ["functions", secure],
    ]);
    const r = recommendRemediation("chain", topics, edges, estimates);
    expect(r).toMatchObject({ kind: "prerequisite", topicId: "limits", status: "not_enough_evidence" });
  });

  it("says the gap is in the topic itself when every prerequisite is secure", () => {
    const estimates = new Map([
      ["chain", struggling],
      ["derivatives", secure],
      ["limits", secure],
      ["functions", secure],
    ]);
    expect(recommendRemediation("chain", topics, edges, estimates)).toMatchObject({ kind: "self" });
  });

  it("does nothing for a topic that isn't struggling", () => {
    const estimates = new Map([["chain", secure]]);
    expect(recommendRemediation("chain", topics, edges, estimates)).toBeNull();
  });
});
