import { describe, it, expect } from "vitest";
import { buildRevisionPlan, prioritizeTopics, type RevisionInput, type RevisionPlan, type RevisionTopic } from "./revision";

// Wednesday Oct 21 2026, 10:00 in UTC.
const NOW = new Date("2026-10-21T10:00:00Z");

const TOPICS: RevisionTopic[] = [
  { id: "a", title: "Gas laws", status: "secure", estimate: 92, due: true },
  { id: "b", title: "Stoichiometry", status: "needs_review", estimate: 40, due: true },
  { id: "c", title: "Moles", status: "developing", estimate: 65, due: false },
  { id: "d", title: "Equilibrium", status: "not_enough_evidence", estimate: null, due: false },
  { id: "e", title: "Bonding", status: "developing", estimate: 55, due: false },
];

function base(overrides: Partial<RevisionInput> = {}): RevisionInput {
  return {
    exam: { id: "x", title: "Unit 3 test", at: new Date("2026-10-27T15:00:00Z") },
    now: NOW,
    timeZone: "UTC",
    topics: TOPICS,
    availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 16 * 60, endMinute: 20 * 60 })),
    busy: [],
    horizonDays: 28,
    ...overrides,
  };
}

function plan(overrides: Partial<RevisionInput> = {}): RevisionPlan {
  const result = buildRevisionPlan(base(overrides));
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("prioritizeTopics", () => {
  it("orders weakest first", () => {
    expect(prioritizeTopics(TOPICS).map((t) => t.title)).toEqual(["Stoichiometry", "Bonding", "Moles", "Equilibrium", "Gas laws"]);
  });
});

describe("buildRevisionPlan", () => {
  it("spreads sessions over the days left, weakest topics first and again in a final mixed review", () => {
    const p = plan();
    expect(p.daysLeft).toBe(6);
    expect(p.sessions.length).toBe(6);
    expect(p.sessions[0]).toMatchObject({ date: "2026-10-21", startMinute: 16 * 60, topics: ["Stoichiometry"], kind: "focus" });
    expect(p.sessions.every((s) => s.date < "2026-10-27")).toBe(true);
    const last = p.sessions.at(-1)!;
    expect(last.kind).toBe("mixed");
    expect(last.topics).toEqual(["Stoichiometry", "Bonding", "Moles", "Gas laws"]);
    // Weak topics come back on a later day (spacing), the secure one only in the mix.
    const firstPass = p.sessions.slice(0, -1).flatMap((s) => s.topics);
    expect(firstPass.filter((t) => t === "Stoichiometry").length).toBeGreaterThanOrEqual(2);
    expect(firstPass).not.toContain("Gas laws");
    expect(p.notes.join(" ")).toMatch(/doesn't know what the exam actually covers/);
    for (const s of p.sessions) {
      expect(s.minutes).toBeGreaterThanOrEqual(20);
      expect(s.minutes).toBeLessThanOrEqual(90);
    }
  });

  it("avoids blocks already on the planner and time already past today", () => {
    const p = plan({
      now: new Date("2026-10-21T16:20:00Z"),
      busy: [{ localDate: "2026-10-21", startMinute: 17 * 60, durationMinutes: 60 }],
    });
    // 16:35 is earliest; 16:45..17:10 would clash with 17:00, so it goes after 18:00.
    expect(p.sessions[0]).toMatchObject({ date: "2026-10-21", startMinute: 18 * 60 });
  });

  it("skips days without free study time and says so", () => {
    const p = plan({ availability: [{ dayOfWeek: 5, startMinute: 600, endMinute: 720 }] });
    expect(p.sessions.map((s) => s.date)).toEqual(["2026-10-23"]);
    expect(p.notes.join(" ")).toMatch(/no free time/);
  });

  it("uses evenings when study hours aren't set, and says so", () => {
    const p = plan({ availability: [] });
    expect(p.sessions[0].startMinute).toBe(17 * 60);
    expect(p.notes.join(" ")).toMatch(/haven't set study hours/);
  });

  it("caps sessions and keeps the day before the exam", () => {
    const p = plan({ exam: { id: "x", title: "Final", at: new Date("2026-11-15T15:00:00Z") } });
    expect(p.sessions.length).toBe(6);
    expect(p.sessions.at(-1)!.date).toBe("2026-11-14");
  });

  it("only plans inside the planner's window", () => {
    const p = plan({ exam: { id: "x", title: "Final", at: new Date("2026-12-20T15:00:00Z") } });
    expect(p.sessions.every((s) => s.date <= "2026-11-17")).toBe(true);
    expect(p.notes.join(" ")).toMatch(/only holds blocks 28 days ahead/);
  });

  it("handles an exam today, no topics, and a past exam honestly", () => {
    const today = plan({ exam: { id: "x", title: "Quiz", at: new Date("2026-10-21T20:00:00Z") } });
    expect(today.sessions).toEqual([]);
    expect(today.notes.join(" ")).toMatch(/exam is today: a short look at Stoichiometry/);

    const none = plan({ topics: [] });
    expect(none.sessions[0].topics).toEqual(["General review"]);
    expect(none.notes.join(" ")).toMatch(/no confirmed topics/);

    expect(buildRevisionPlan(base({ exam: { id: "x", title: "Old", at: new Date("2026-10-01T10:00:00Z") } }))).toEqual({ error: "That exam has already happened." });
  });

  it("is deterministic", () => {
    expect(plan()).toEqual(plan());
  });
});
