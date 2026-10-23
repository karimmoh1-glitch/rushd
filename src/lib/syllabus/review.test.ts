import { describe, expect, it } from "vitest";
import { defaultMinutes, findDuplicate, includedByDefault, previewCounts, savedAs } from "./review";
import { parseSyllabus } from "./parse";
import type { DraftAssessment } from "./types";

const item = (overrides: Partial<DraftAssessment> = {}): DraftAssessment => ({
  id: "a1",
  title: "Quiz 3",
  type: "quiz",
  date: "2026-11-05",
  time: null,
  dateText: "Nov 5",
  dateConfidence: "high",
  weight: null,
  week: null,
  confidence: "high",
  issues: [],
  source: { line: 4, snippet: "Quiz 3: Nov 5" },
  ...overrides,
});

describe("syllabus review rules", () => {
  it("matches duplicates by title within a day, ignoring case and punctuation", () => {
    const existing = [{ title: "quiz 3!", date: "2026-11-06", kind: "exam" as const }];
    expect(findDuplicate({ title: "Quiz 3", date: "2026-11-05" }, existing)).toEqual(existing[0]);
    expect(findDuplicate({ title: "Quiz 3", date: "2026-11-08" }, existing)).toBeNull();
    expect(findDuplicate({ title: "Quiz 3", date: null }, existing)).toEqual(existing[0]);
    expect(findDuplicate({ title: "Quiz 4", date: "2026-11-05" }, existing)).toBeNull();
  });

  it("starts confident, new, upcoming rows included and everything else left out", () => {
    expect(includedByDefault(item(), false, "2026-10-23")).toBe(true);
    expect(includedByDefault(item(), true, "2026-10-23")).toBe(false);
    expect(includedByDefault(item({ issues: ["No year in your syllabus — assumed 2026."], confidence: "medium" }), false)).toBe(false);
    expect(includedByDefault(item({ date: null }), false)).toBe(false);
    expect(includedByDefault(item({ date: "2026-09-01" }), false, "2026-10-23")).toBe(false);
  });

  it("saves quizzes, midterms and finals as exams, the rest as assignments, with type-based estimates", () => {
    expect(savedAs("midterm")).toBe("exam");
    expect(savedAs("lab")).toBe("assignment");
    expect(defaultMinutes("final")).toBeGreaterThan(defaultMinutes("quiz"));
  });

  it("counts by confidence for analytics, with no text", () => {
    const draft = parseSyllabus("Quiz 1: TBA\nMidterm: October 14, 2026\nSchedule\nWeek 1: Limits", { today: "2026-10-01" });
    const counts = previewCounts(draft, 0);
    expect(counts).toEqual({ method: "rules", assessments: { high: 1, medium: 0, low: 1 }, topics: { high: 0, medium: 1, low: 0 }, objectives: 0, uncertain: 1, duplicates: 0 });
  });
});
