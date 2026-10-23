import { describe, it, expect } from "vitest";
import { describeChange, diffPlans, missedBlocks, parseSnapshot, snapshotFromSessions, summarizeChanges, type PlanSnapshot, type SnapshotItem } from "./diff";
import type { ScheduledSession, WorkItem } from "./types";

// Thursday Oct 22 2026 is "today" unless a test says otherwise.
const TODAY = "2026-10-22";

function item(id: string, title: string, blocks: [string, number][], kind: SnapshotItem["kind"] = "assignment"): SnapshotItem {
  return { kind, id, title, className: "Chemistry", blocks: blocks.map(([date, minutes], i) => ({ date, start: 960 + i, minutes })) };
}
const snap = (today: string, items: SnapshotItem[]): PlanSnapshot => ({ v: 1, today, items });

describe("snapshotFromSessions", () => {
  it("keeps only the shown week, grouped per item, in a stable order", () => {
    const work = (id: string): WorkItem => ({
      kind: "assignment",
      id,
      classId: "c1",
      title: id,
      className: "Chemistry",
      classColor: "#000",
      priority: "MEDIUM",
      classPriority: "MEDIUM",
      dueAt: new Date(),
      remainingMinutes: 60,
      rawEstimatedMinutes: 60,
      estimateAdjusted: false,
    });
    const session = (id: string, date: string, start: number): ScheduledSession => ({
      item: work(id),
      scheduledDate: date,
      scheduledMinutes: 30,
      startMinute: start,
      score: 1,
      reasonCode: "STANDARD",
    });
    const s = snapshotFromSessions([session("b", "2026-10-23", 900), session("a", "2026-10-30", 900), session("b", "2026-10-22", 960), session("a", "2026-10-28", 600)], TODAY);
    expect(s.today).toBe(TODAY);
    expect(s.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(s.items[0].blocks).toEqual([{ date: "2026-10-28", start: 600, minutes: 30 }]); // Oct 30 is past the 7-day window
    expect(s.items[1].blocks.map((b) => b.date)).toEqual(["2026-10-22", "2026-10-23"]);
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSnapshot({ v: 2 })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});

describe("diffPlans", () => {
  it("returns nothing without a previous plan or when nothing moved", () => {
    const s = snap(TODAY, [item("a", "Lab report", [[TODAY, 60]])]);
    expect(diffPlans(null, s, { trigger: "other", today: TODAY })).toEqual([]);
    expect(diffPlans(s, s, { trigger: "other", today: TODAY })).toEqual([]);
  });

  it("explains a skipped block and the ripple it caused", () => {
    const before = snap(TODAY, [item("lab", "Chem lab report", [[TODAY, 60]]), item("essay", "Essay draft", [["2026-10-23", 60]])]);
    const after = snap(TODAY, [item("lab", "Chem lab report", [["2026-10-23", 60]]), item("essay", "Essay draft", [["2026-10-24", 60]])]);
    const changes = diffPlans(before, after, { trigger: "block_skipped", today: TODAY, skipped: new Set(["assignment:lab"]) });
    expect(changes.map((c) => [c.itemId, c.type, c.cause])).toEqual([
      ["lab", "moved", "skipped"],
      ["essay", "moved", "made_room"],
    ]);
    expect(summarizeChanges(changes, TODAY)).toEqual([
      "Moved Chem lab report to tomorrow because you skipped it today.",
      "Moved Essay draft to Saturday to make room for Chem lab report.",
    ]);
  });

  it("explains a missed block from an earlier day, naming the day", () => {
    // The plan was made on Tuesday; it's Thursday. The Tuesday block never happened.
    const before = snap("2026-10-20", [item("lab", "Chem lab report", [["2026-10-20", 60], ["2026-10-23", 60]])]);
    const after = snap(TODAY, [item("lab", "Chem lab report", [[TODAY, 60], ["2026-10-23", 60]])]);
    const ctx = { trigger: "missed_session" as const, today: TODAY };
    expect([...missedBlocks(before, ctx)]).toEqual([["assignment:lab", "2026-10-20"]]);
    const [change] = diffPlans(before, after, ctx);
    expect(change).toMatchObject({ type: "moved", cause: "missed", causeDate: "2026-10-20", fromDate: "2026-10-23", toDate: TODAY });
    expect(describeChange(change, TODAY)).toBe("Moved Chem lab report to today because you missed Tuesday's block.");
  });

  it("says plainly when a missed block leaves no time, and when a ripple pushes work out of the week", () => {
    const before = snap("2026-10-21", [item("lab", "Lab report", [["2026-10-21", 60], [TODAY, 60]]), item("dbq", "DBQ outline", [["2026-10-23", 60]])]);
    const after = snap(TODAY, [item("ps", "Problem set", [["2026-10-23", 60]])]);
    const lines = summarizeChanges(
      diffPlans(before, after, { trigger: "block_skipped", today: TODAY, skipped: new Set(["assignment:ps"]) }),
      TODAY,
      5,
    );
    expect(lines).toContain("You missed yesterday's block for Lab report, and there's no time left for it before it's due.");
    expect(lines).toContain("DBQ outline has no time this week now: it went to Problem set.");
  });

  it("a block that was studied isn't missed, and neither is finished work", () => {
    const before = snap("2026-10-21", [item("lab", "Chem lab report", [["2026-10-21", 60]]), item("quiz", "Quiz prep", [["2026-10-21", 30]])]);
    const ctx = { trigger: "new_day" as const, today: TODAY, studied: new Set(["assignment:lab@2026-10-21"]), completed: new Set(["assignment:quiz"]) };
    expect(missedBlocks(before, ctx).size).toBe(0);
  });

  it("explains new work, finished work, and the time it freed", () => {
    const before = snap(TODAY, [item("done", "Problem set", [[TODAY, 60]]), item("essay", "Essay draft", [["2026-10-23", 60]])]);
    const after = snap(TODAY, [item("essay", "Essay draft", [[TODAY, 60]]), item("new", "Reading notes", [["2026-10-24", 30]])]);
    const changes = diffPlans(before, after, {
      trigger: "assignment_completed",
      today: TODAY,
      completed: new Set(["assignment:done"]),
      added: new Set(["assignment:new"]),
    });
    const lines = summarizeChanges(changes, TODAY, 5);
    expect(lines).toEqual([
      "Took Problem set off your plan. It's done.",
      "Planned Reading notes, starting Saturday.",
      "Moved Essay draft up to today, into time freed by Problem set.",
    ]);
  });

  it("explains review and prep changes after practice", () => {
    const before = snap(TODAY, [item("c1", "Review: Gas laws", [[TODAY, 20]], "review"), item("exam", "Unit 3 test", [["2026-10-23", 60]], "exam")]);
    const after = snap(TODAY, [item("exam", "Unit 3 test", [["2026-10-23", 60], ["2026-10-24", 30]], "exam"), item("c2", "Review: Treaties", [["2026-10-23", 10]], "review")]);
    const lines = summarizeChanges(diffPlans(before, after, { trigger: "practice_completed", today: TODAY }), TODAY, 5);
    expect(lines).toEqual([
      "Dropped the Chemistry review: your latest practice covered it.",
      "Added a review of Treaties tomorrow, from your latest practice.",
      "Gave Unit 3 test 30 minutes more prep: your latest practice shows more to review.",
    ]);
  });

  it("explains not-this-week and estimate changes", () => {
    const before = snap(TODAY, [item("lab", "Chem lab report", [[TODAY, 60]]), item("essay", "Essay draft", [["2026-10-23", 60]])]);
    const after = snap(TODAY, [item("essay", "Essay draft", [["2026-10-23", 120]])]);
    const changes = diffPlans(before, after, {
      trigger: "not_this_week",
      today: TODAY,
      notThisWeek: new Set(["assignment:lab"]),
      estimateChanged: new Set(["assignment:essay"]),
    });
    expect(summarizeChanges(changes, TODAY)).toEqual([
      "Took Chem lab report out of this week, as you asked.",
      "Essay draft now has 2h this week, from your new estimate.",
    ]);
  });

  it("ignores small minute differences and orders specific causes first", () => {
    const before = snap(TODAY, [item("a", "A", [[TODAY, 60]]), item("b", "B", [["2026-10-24", 60]])]);
    const after = snap(TODAY, [item("a", "A", [[TODAY, 70]]), item("b", "B", [["2026-10-25", 60]])]);
    const changes = diffPlans(before, after, { trigger: "other", today: TODAY });
    expect(changes.map((c) => c.itemId)).toEqual(["b"]);
    expect(changes[0].cause).toBe("other");
    expect(summarizeChanges(changes, TODAY)).toEqual(["Moved B to Sunday."]);
  });

  it("is deterministic", () => {
    const before = snap(TODAY, [item("x", "X", [[TODAY, 60]]), item("y", "Y", [[TODAY, 30]])]);
    const after = snap(TODAY, [item("y", "Y", [["2026-10-23", 30]]), item("x", "X", [["2026-10-24", 60]])]);
    const ctx = { trigger: "other" as const, today: TODAY };
    expect(diffPlans(before, after, ctx)).toEqual(diffPlans(before, after, ctx));
  });
});
