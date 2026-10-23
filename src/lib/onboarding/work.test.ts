import { describe, it, expect } from "vitest";
import { matchCourse, parseWork } from "./work";

const courses = [
  { title: "AP Chemistry", catalogId: "ap-chemistry" },
  { title: "AP United States History", catalogId: "ap-united-states-history" },
  { title: "Marine Robotics Lab", catalogId: null },
];
const now = new Date("2026-10-22T15:00:00Z");

describe("onboarding work lines", () => {
  it("matches a line to a picked course by prefix, alias, or words", () => {
    expect(matchCourse({ className: "Chem", title: "Lab report" }, courses)).toBe(0);
    expect(matchCourse({ className: "Apush", title: "DBQ outline" }, courses)).toBe(1);
    expect(matchCourse({ className: "Chemistry", title: "Titration lab" }, courses)).toBe(0);
    expect(matchCourse({ className: "General", title: "Robotics build log" }, courses)).toBe(2);
    expect(matchCourse({ className: "Spanish", title: "Vocab quiz" }, courses)).toBe(-1);
  });

  it("parses lines into drafts; unmatched prefixes become a new course, unmatched guesses the first course", () => {
    const drafts = parseWork("Chem: lab report tomorrow 2h\nSpanish quiz friday\nread chapter 4", courses, now);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({ kind: "assignment", title: "Lab report", minutes: 120, course: { index: 0 } });
    expect(drafts[1]).toMatchObject({ kind: "exam", course: { newName: "Spanish" } });
    expect(drafts[2].course).toEqual({ index: 0 });
    expect(drafts[2].assumedDate).toBe(true);
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(3);
  });

  it("with no courses picked, everything becomes a new course", () => {
    const drafts = parseWork("Bio: lab tomorrow\nessay draft monday", [], now);
    expect(drafts.map((draft) => draft.course)).toEqual([{ newName: "Bio" }, { newName: "English" }]);
  });
});
