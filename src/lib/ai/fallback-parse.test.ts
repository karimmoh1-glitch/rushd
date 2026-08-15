import { describe, it, expect } from "vitest";
import { fallbackParseQuickAdd, type ClassRef } from "./fallback-parse";

// Saturday.
const NOW = new Date("2026-08-15T10:00:00");

const CLASSES: ClassRef[] = [
  { id: "chem1", name: "AP Chemistry" },
  { id: "hist1", name: "US History" },
];

describe("fallbackParseQuickAdd", () => {
  it("never throws and always returns a usable title", () => {
    const draft = fallbackParseQuickAdd("", [], NOW);
    expect(draft.title.length).toBeGreaterThan(0);
    expect(draft.minutes).toBeGreaterThan(0);
  });

  it("extracts effort in hours", () => {
    const draft = fallbackParseQuickAdd("Lab report ~2 hours", [], NOW);
    expect(draft.minutes).toBe(120);
  });

  it("extracts effort in minutes", () => {
    const draft = fallbackParseQuickAdd("Quick worksheet 30 min", [], NOW);
    expect(draft.minutes).toBe(30);
  });

  it("recognizes 'today' and 'tomorrow'", () => {
    const today = fallbackParseQuickAdd("Reading due today", [], NOW);
    expect(today.dueAt).not.toBeNull();
    expect(new Date(today.dueAt!).toDateString()).toBe(NOW.toDateString());

    const tomorrow = fallbackParseQuickAdd("Reading due tomorrow", [], NOW);
    const expected = new Date(NOW);
    expected.setDate(NOW.getDate() + 1);
    expect(new Date(tomorrow.dueAt!).toDateString()).toBe(expected.toDateString());
  });

  it("resolves a weekday name to the next occurrence, today if it matches", () => {
    // NOW is Saturday (day 6). Asking for "Saturday" should resolve to today.
    const draft = fallbackParseQuickAdd("Essay due Saturday", [], NOW);
    expect(new Date(draft.dueAt!).toDateString()).toBe(NOW.toDateString());
  });

  it("resolves an explicit m/d date", () => {
    const draft = fallbackParseQuickAdd("Project due 8/20", [], NOW);
    expect(draft.dueAt).not.toBeNull();
    const date = new Date(draft.dueAt!);
    expect(date.getMonth()).toBe(7); // August
    expect(date.getDate()).toBe(20);
  });

  it("matches an existing class by exact name", () => {
    const draft = fallbackParseQuickAdd("AP Chemistry lab due Friday", CLASSES, NOW);
    expect(draft.classId).toBe("chem1");
  });

  it("matches an existing class by a significant word", () => {
    const draft = fallbackParseQuickAdd("Chemistry lab due Friday", CLASSES, NOW);
    expect(draft.classId).toBe("chem1");
  });

  it("leaves classId null when nothing matches", () => {
    const draft = fallbackParseQuickAdd("Read a book", CLASSES, NOW);
    expect(draft.classId).toBeNull();
  });

  it("detects exam-like language and defaults exam effort higher", () => {
    const draft = fallbackParseQuickAdd("Unit 4 test Friday", [], NOW);
    expect(draft.kind).toBe("exam");
    expect(draft.minutes).toBe(120);
  });

  it("defaults to assignment for ordinary text", () => {
    const draft = fallbackParseQuickAdd("Read chapter 5", [], NOW);
    expect(draft.kind).toBe("assignment");
    expect(draft.minutes).toBe(30);
  });

  it("produces a clean title stripped of matched date/effort/class phrases", () => {
    const draft = fallbackParseQuickAdd(
      "AP Chemistry lab report due Friday ~2 hours",
      CLASSES,
      NOW,
    );
    expect(draft.title.toLowerCase()).toContain("lab report");
    expect(draft.title.toLowerCase()).not.toContain("chemistry");
    expect(draft.title.toLowerCase()).not.toContain("2 hours");
  });

  it("strips a capitalized weekday from the title, not just lowercase matches", () => {
    // Regression: the weekday is detected against a lowercased copy of the
    // text but must still be removed from the original-case text.
    const draft = fallbackParseQuickAdd(
      "US History essay due Monday ~90 min",
      CLASSES,
      NOW,
    );
    expect(draft.title.toLowerCase()).not.toContain("monday");
    expect(draft.title.toLowerCase()).toContain("essay");
  });

  it("is deterministic for identical input", () => {
    const a = fallbackParseQuickAdd("AP Chemistry lab due Friday ~2 hours", CLASSES, NOW);
    const b = fallbackParseQuickAdd("AP Chemistry lab due Friday ~2 hours", CLASSES, NOW);
    expect(a).toEqual(b);
  });
});
