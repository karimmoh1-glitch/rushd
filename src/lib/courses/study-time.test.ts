import { describe, expect, it } from "vitest";
import { studyTimeByCourse } from "./study-time";

const chem = { id: "c1", name: "Chemistry", color: "#00f", weeklyHours: 3 };
const english = { id: "c2", name: "English", color: "#f00", weeklyHours: null };
const history = { id: "c3", name: "History", color: "#0f0", weeklyHours: null };

describe("studyTimeByCourse", () => {
  it("adds up real minutes per course through assignments and exams", () => {
    const rows = studyTimeByCourse([chem, english], [
      { actualMinutes: 40, plannedMinutes: 30, assignment: { classId: "c1" }, exam: null },
      { actualMinutes: null, plannedMinutes: 25, assignment: null, exam: { classId: "c1" } },
      { actualMinutes: 15, plannedMinutes: 30, assignment: { classId: "c2" }, exam: null },
    ]);
    expect(rows).toEqual([
      { id: "c1", name: "Chemistry", color: "#00f", minutes: 65, goalMinutes: 180 },
      { id: "c2", name: "English", color: "#f00", minutes: 15, goalMinutes: null },
    ]);
  });

  it("keeps a course with a goal even before any study, and drops courses with neither", () => {
    const rows = studyTimeByCourse([chem, history], []);
    expect(rows.map((row) => row.id)).toEqual(["c1"]);
    expect(rows[0].minutes).toBe(0);
  });

  it("ignores sessions that aren't tied to a course", () => {
    const rows = studyTimeByCourse([english], [
      { actualMinutes: 30, plannedMinutes: 30, assignment: null, exam: null },
    ]);
    expect(rows).toEqual([]);
  });
});
