// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSyllabus } from "./parse";
import { isUncertain, type DraftAssessment, type SyllabusDraft } from "./types";
import { findDateTokens, resolveMonthDay, weekSpan, type YearContext } from "./dates";

// Fixture syllabi written for these tests (fictional courses and people).
function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, "fixtures", `${name}.txt`), "utf8");
}

const TODAY = "2026-10-23";

function byTitle(draft: SyllabusDraft, title: string): DraftAssessment {
  const found = draft.assessments.find((a) => a.title === title);
  if (!found) throw new Error(`no assessment "${title}" in ${draft.assessments.map((a) => a.title).join(", ")}`);
  return found;
}

describe("parseSyllabus — high school AP course", () => {
  const draft = parseSyllabus(fixture("ap-chemistry"), { today: TODAY });

  it("reads course details only as written", () => {
    expect(draft.method).toBe("rules");
    expect(draft.course.title?.value).toBe("AP Chemistry");
    expect(draft.course.instructor?.value).toBe("Ms. Alvarez");
    expect(draft.course.term?.value).toBe("Fall 2026");
    // No course code, no term dates in this syllabus: nothing is invented.
    expect(draft.course.code).toBeNull();
    expect(draft.course.termStart).toBeNull();
    expect(draft.course.termEnd).toBeNull();
  });

  it("finds dated assessments in several date formats, with the year from the named term", () => {
    expect(byTitle(draft, "Unit 1 Test")).toMatchObject({ type: "exam", date: "2026-09-18", confidence: "high", issues: [] });
    expect(byTitle(draft, "Lab 2 report")).toMatchObject({ type: "lab", date: "2026-10-23", dateText: "10/23" });
    expect(byTitle(draft, "Unit 2 Test").date).toBe("2026-10-09");
    expect(byTitle(draft, "Unit 3 Quiz")).toMatchObject({ type: "quiz", date: "2026-10-30" });
    // The weekday matches the date, and the grading section gives its weight.
    expect(byTitle(draft, "Midterm Exam")).toMatchObject({ type: "midterm", date: "2026-12-10", weight: 10, confidence: "high" });
  });

  it("flags TBA and grading-only finals instead of guessing a date", () => {
    const unit4 = byTitle(draft, "Unit 4 Test");
    expect(unit4.date).toBeNull();
    expect(unit4.issues[0]).toMatch(/to be announced/);
    expect(isUncertain(unit4)).toBe(true);
    const final = byTitle(draft, "Final Exam");
    expect(final).toMatchObject({ type: "final", date: null, weight: 10, confidence: "low" });
    expect(final.issues[0]).toMatch(/no date/);
  });

  it("keeps grading categories out of the assessment list and ignores the late-work policy", () => {
    expect(draft.grading.map((g) => [g.label, g.weight])).toEqual([
      ["Tests", 45],
      ["Labs", 25],
      ["Homework", 10],
      ["Midterm Exam", 10],
      ["Final Exam", 10],
    ]);
    expect(draft.assessments.map((a) => a.title)).not.toContain("Tests");
    expect(draft.assessments.some((a) => /late/i.test(a.title))).toBe(false);
  });

  it("reads the numbered unit list as topics and the bullets as objectives", () => {
    expect(draft.topics.map((t) => t.title)).toEqual([
      "Atomic Structure and Properties",
      "Molecular and Ionic Compound Structure",
      "Intermolecular Forces and Properties",
      "Chemical Reactions",
      "Kinetics",
      "Thermodynamics",
      "Equilibrium",
    ]);
    expect(draft.objectives).toHaveLength(4);
    expect(draft.objectives[1].text).toBe("Use stoichiometry to predict the amounts of reactants and products");
    expect(draft.objectives.every((o) => o.confidence === "high")).toBe(true);
  });

  it("points every item at the line it came from", () => {
    const text = fixture("ap-chemistry").split("\n");
    for (const item of [...draft.assessments, ...draft.topics, ...draft.objectives]) {
      expect(item.source.line).not.toBeNull();
      expect(text[item.source.line! - 1].trim()).toBe(item.source.snippet);
    }
  });
});

describe("parseSyllabus — university STEM course with a weekly schedule", () => {
  const draft = parseSyllabus(fixture("university-physics"), { today: TODAY });

  it("reads code, title, instructor and term dates from the syllabus", () => {
    expect(draft.course.code?.value).toBe("PHYS 151");
    expect(draft.course.title?.value).toBe("Introductory Mechanics");
    expect(draft.course.instructor?.value).toBe("Dr. Priya Raman");
    expect(draft.course.termStart).toMatchObject({ value: "2027-01-11", confidence: "high" });
    expect(draft.course.termEnd).toMatchObject({ value: "2027-04-30", confidence: "high" });
  });

  it("resolves 'Week N' plus a weekday from the schedule's own dates", () => {
    expect(byTitle(draft, "Problem Set 1")).toMatchObject({ date: "2027-01-22", week: 2, confidence: "medium", issues: [] });
    expect(byTitle(draft, "Problem Set 2")).toMatchObject({ date: "2027-01-29", week: 3 });
    expect(byTitle(draft, "Lab 1: Measuring g — report")).toMatchObject({ type: "lab", date: "2027-02-04" });
    // Week 8 sits after the Feb 24 midterm, Week 11 after spring break.
    expect(byTitle(draft, "Problem Set 4").date).toBe("2027-03-05");
    expect(byTitle(draft, "Lab 2 report").date).toBe("2027-03-25");
  });

  it("keeps the midterm's time and weight, and leaves the final undated", () => {
    expect(byTitle(draft, "Midterm exam")).toMatchObject({ type: "midterm", date: "2027-02-24", time: "19:00", weight: 25, confidence: "high" });
    const final = byTitle(draft, "Final exam");
    expect(final).toMatchObject({ date: null, weight: 35, confidence: "low" });
  });

  it("builds week topics with dates, subtopics, and readings, and skips breaks and review weeks", () => {
    const titles = draft.topics.map((t) => t.title);
    expect(titles).toContain("Newton's laws of motion");
    expect(titles).not.toContain("Review");
    expect(titles.some((t) => /break/i.test(t))).toBe(false);
    const kinematics = draft.topics.find((t) => t.title === "Kinematics in one dimension")!;
    expect(kinematics).toMatchObject({ week: 1, startDate: "2027-01-11", endDate: "2027-01-15", readings: "Ch. 1–2" });
    const friction = draft.topics.find((t) => t.title === "Friction and tension")!;
    expect(friction).toMatchObject({ parentTitle: "Newton's laws of motion", week: 3 });
    expect(draft.objectives).toHaveLength(4);
  });

  it("uses the student's own term start over the syllabus's when it is set", () => {
    const shifted = parseSyllabus(fixture("university-physics"), { today: TODAY, termStart: "2027-01-18", termEnd: "2027-05-07" });
    // Week 3 now starts Feb 1; dates written in the schedule itself still win for weeks 1-2.
    expect(byTitle(shifted, "Problem Set 2").date).toBe("2027-02-05");
    expect(byTitle(shifted, "Problem Set 1").date).toBe("2027-01-22");
  });
});

describe("parseSyllabus — reading-heavy humanities course", () => {
  const draft = parseSyllabus(fixture("humanities-novel"), { today: TODAY });

  it("finds papers and essays with dates and the weights that name them", () => {
    expect(draft.course.code?.value).toBe("ENGL 210");
    expect(draft.course.title?.value).toBe("The Novel and Its Readers");
    expect(byTitle(draft, "Response paper 1")).toMatchObject({ type: "paper", date: "2026-09-11", confidence: "high" });
    expect(byTitle(draft, "Essay 1 (5 pages)")).toMatchObject({ date: "2026-10-02", weight: 20 });
    // "Essay 2 20%" belongs to Essay 2, not to its proposal.
    expect(byTitle(draft, "Essay 2 proposal").weight).toBeNull();
    expect(byTitle(draft, "Essay 2")).toMatchObject({ date: "2026-11-13", weight: 20 });
    expect(byTitle(draft, "Final paper")).toMatchObject({ type: "paper", date: "2026-12-11", time: "23:59", weight: 25 });
  });

  it("turns the reading schedule into dated topics and flags a week-only deliverable", () => {
    expect(draft.topics.find((t) => t.title === "Austen, Pride and Prejudice, vols. 1–2")).toMatchObject({ week: 2, startDate: "2026-09-07" });
    expect(draft.topics.some((t) => /thanksgiving|introductions/i.test(t.title))).toBe(false);
    const draftDue = byTitle(draft, "Bring a full draft");
    expect(draftDue.issues[0]).toMatch(/only the week/);
    expect(isUncertain(draftDue)).toBe(true);
    expect(draft.objectives.map((o) => o.text)).toContain("Develop an argument through drafting and revision");
  });

  it("does not treat participation or weekly responses as dated work", () => {
    expect(draft.grading.find((g) => g.label === "Weekly reading responses")?.weight).toBe(20);
    expect(draft.assessments.some((a) => /participation|weekly reading/i.test(a.title))).toBe(false);
  });
});

describe("parseSyllabus — a messy, ambiguous syllabus", () => {
  const draft = parseSyllabus(fixture("messy"), { today: TODAY });

  it("flags every ambiguity instead of resolving it silently", () => {
    expect(draft.course.title?.value).toBe("Intro to Statistics");
    expect(draft.course.instructor?.value).toBe("mr. b. hale");

    const hw = byTitle(draft, "HW 1");
    expect(hw.date).toBeNull();
    expect(hw.issues[0]).toMatch(/term start/);

    expect(byTitle(draft, "Quiz 1").issues[0]).toMatch(/to be announced/);

    // Two dates for one midterm: kept once, both dates shown.
    const midterms = draft.assessments.filter((a) => a.type === "midterm");
    expect(midterms).toHaveLength(1);
    expect(midterms[0].issues.join(" ")).toMatch(/more than one date: Oct 14 \(line 9\) and Oct 16 \(line 10\)/);
    expect(midterms[0]).toMatchObject({ confidence: "low", weight: 20 });

    // No year anywhere: assumed, and said so; the weekday doesn't match.
    const proposal = byTitle(draft, "Project proposal");
    expect(proposal.issues).toContain("No year in your syllabus — assumed 2026.");
    expect(proposal.issues).toContain("Your syllabus says Friday, but Oct 3, 2026 is a Saturday.");
    expect(byTitle(draft, "Problem set 3")).toMatchObject({ date: "2027-03-04", confidence: "medium" });
    expect(byTitle(draft, "Final exam").issues[0]).toMatch(/finals week/);

    expect(draft.notes[0]).toMatch(/counts weeks/);
    expect(draft.assessments.every((a) => isUncertain(a))).toBe(true);
  });

  it("ignores policy sentences and reads an inline grading line", () => {
    expect(draft.assessments.some((a) => /late|rescheduled/i.test(a.title))).toBe(false);
    expect(draft.grading.map((g) => g.label)).toEqual(["Homework", "Quizzes", "Midterm", "Project"]);
    // "project 30%" is a category, not the proposal's weight.
    expect(byTitle(draft, "Project proposal").weight).toBeNull();
  });

  it("places weeks once the student's term start is known", () => {
    const placed = parseSyllabus(fixture("messy"), { today: TODAY, termStart: "2026-08-24", termEnd: "2026-12-11" });
    expect(byTitle(placed, "Quiz")).toMatchObject({ date: "2026-09-22", issues: [] });
    expect(byTitle(placed, "HW 1").issues[0]).toMatch(/only the week/);
    expect(placed.notes).toEqual([]);
    expect(byTitle(placed, "Problem set 3").issues[0]).toMatch(/outside the term/);
  });

  it("never throws on empty or junk input", () => {
    expect(parseSyllabus("", { today: TODAY }).assessments).toEqual([]);
    const junk = parseSyllabus("%%%% \u0000 ~~~\n\n12345", { today: TODAY });
    expect(junk.assessments).toEqual([]);
    expect(junk.notes[0]).toMatch(/couldn't find/);
  });
});

describe("syllabus dates", () => {
  const ctx: YearContext = { termStart: null, termEnd: null, termSource: null, docTerm: null, today: TODAY };

  it("reads the common date formats", () => {
    const kinds = (text: string) => findDateTokens(text).map((t) => t.kind);
    expect(kinds("Due 2026-10-14")).toEqual(["date"]);
    expect(kinds("Due Oct. 14th, 2026 at 5pm")).toEqual(["date", "time"]);
    expect(kinds("Due 14 October 2026")).toEqual(["date"]);
    expect(kinds("Due 10/14/26")).toEqual(["date"]);
    expect(kinds("Oct 14–16")).toEqual(["range"]);
    expect(kinds("9/8 - 9/12")).toEqual(["range"]);
    expect(kinds("Weeks 3-4")).toEqual(["week"]);
    expect(kinds("date TBA")).toEqual(["tba"]);
    expect(kinds("Take the SAT on Saturday")).toEqual(["weekday"]);
    expect(kinds("Worth 3/4 of a point")).toEqual(["date"]);
    // A backwards "range" isn't one.
    expect(kinds("10/14 - 3 pm")).toEqual(["date", "time"]);
  });

  it("only trusts a year that is written, or that a term pins down", () => {
    expect(resolveMonthDay({ month: 10, day: 14, year: 2026 }, ctx)).toEqual({ date: "2026-10-14", confidence: "high", issues: [] });
    expect(resolveMonthDay({ month: 2, day: 30, year: 2027 }, ctx).date).toBeNull();
    const term = { ...ctx, termStart: "2026-08-24", termEnd: "2026-12-18", termSource: "course" as const };
    expect(resolveMonthDay({ month: 12, day: 15, year: null }, term)).toMatchObject({ date: "2026-12-15", confidence: "high" });
    const spring = { ...ctx, docTerm: { season: "spring" as const, year: 2027 } };
    expect(resolveMonthDay({ month: 3, day: 2, year: null }, spring)).toMatchObject({ date: "2027-03-02", confidence: "high" });
    expect(resolveMonthDay({ month: 10, day: 2, year: null }, spring).confidence).toBe("low");
    expect(resolveMonthDay({ month: 1, day: 5, year: null }, ctx)).toMatchObject({ date: "2027-01-05", issues: ["No year in your syllabus — assumed 2027."] });
  });

  it("counts weeks from the Monday of the term's first week", () => {
    // The term starts on a Wednesday; week 2 still runs Monday–Friday.
    expect(weekSpan("2026-08-26", 2)).toEqual({ start: "2026-08-31", end: "2026-09-04" });
  });
});
