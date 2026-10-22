import { describe, it, expect } from "vitest";
import {
  isCompleteInCanvas,
  completionMarker,
  parseDueAt,
  estimateMinutes,
  safeCanvasUrl,
  mapAssignment,
} from "./mapping";
import type { CanvasAssignment } from "./client";

const BASE = "https://school.instructure.com";

function a(overrides: Partial<CanvasAssignment> = {}): CanvasAssignment {
  return {
    id: 101,
    course_id: 9,
    name: "Lab report",
    due_at: "2026-10-24T06:59:00Z",
    points_possible: 10,
    html_url: `${BASE}/courses/9/assignments/101`,
    published: true,
    submission_types: ["online_upload"],
    submission: { workflow_state: "unsubmitted", submitted_at: null },
    ...overrides,
  };
}

describe("completion", () => {
  it.each([
    ["submitted", { workflow_state: "submitted" as const, submitted_at: "2026-10-20T10:00:00Z" }, true],
    ["graded", { workflow_state: "graded" as const, submitted_at: null }, true],
    ["pending review", { workflow_state: "pending_review" as const }, true],
    ["excused", { workflow_state: "unsubmitted" as const, excused: true }, true],
    ["unsubmitted", { workflow_state: "unsubmitted" as const }, false],
    ["missing", { workflow_state: "unsubmitted" as const, missing: true }, false],
  ])("%s", (_l, submission, expected) => {
    expect(isCompleteInCanvas(a({ submission }))).toBe(expected);
  });

  it("is incomplete when Canvas sends no submission object", () => {
    expect(isCompleteInCanvas(a({ submission: undefined }))).toBe(false);
  });

  it("uses the submission time as the completion marker, with a stable sentinel otherwise", () => {
    const sub = completionMarker(a({ submission: { workflow_state: "submitted", submitted_at: "2026-10-20T10:00:00Z" } }));
    expect(sub?.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    const ex1 = completionMarker(a({ submission: { excused: true } }));
    const ex2 = completionMarker(a({ submission: { excused: true } }));
    expect(ex1?.getTime()).toBe(ex2?.getTime());
    expect(completionMarker(a())).toBeNull();
  });
});

describe("parseDueAt — timezone correctness", () => {
  it("keeps the exact instant Canvas sends (no day shifting)", () => {
    // 11:59 PM Pacific on Fri Oct 23 is sent by Canvas as 06:59Z Saturday.
    expect(parseDueAt(a())?.toISOString()).toBe("2026-10-24T06:59:00.000Z");
    expect(parseDueAt(a({ due_at: "2026-10-23T23:59:00-07:00" }))?.toISOString()).toBe(
      "2026-10-24T06:59:00.000Z",
    );
  });

  it("refuses offset-less timestamps rather than guessing a zone", () => {
    expect(parseDueAt(a({ due_at: "2026-10-23T23:59:00" }))).toBeNull();
  });

  it("returns null for no due date or garbage", () => {
    expect(parseDueAt(a({ due_at: null }))).toBeNull();
    expect(parseDueAt(a({ due_at: "soon Z" }))).toBeNull();
  });
});

describe("estimateMinutes", () => {
  it("uses fixed estimates for quizzes, discussions, and no-submission work", () => {
    expect(estimateMinutes(a({ submission_types: ["online_quiz"] }))).toBe(30);
    expect(estimateMinutes(a({ submission_types: ["discussion_topic"] }))).toBe(30);
    expect(estimateMinutes(a({ submission_types: ["none"] }))).toBe(20);
  });

  it("scales with points but stays within 30-180 minutes", () => {
    expect(estimateMinutes(a({ points_possible: 10 }))).toBe(45);
    expect(estimateMinutes(a({ points_possible: 100 }))).toBe(135);
    expect(estimateMinutes(a({ points_possible: 1000 }))).toBe(180);
    expect(estimateMinutes(a({ points_possible: 1 }))).toBe(30);
    expect(estimateMinutes(a({ points_possible: null }))).toBe(45);
  });
});

describe("safeCanvasUrl", () => {
  it("keeps links on the connected Canvas origin only", () => {
    expect(safeCanvasUrl(BASE, `${BASE}/courses/9/assignments/101`)).toBe(`${BASE}/courses/9/assignments/101`);
    expect(safeCanvasUrl(BASE, "https://evil.example.com/phish")).toBeNull();
    expect(safeCanvasUrl(BASE, "javascript:alert(1)")).toBeNull();
    expect(safeCanvasUrl(BASE, undefined)).toBeNull();
  });
});

describe("mapAssignment", () => {
  it("maps a normal assignment", () => {
    const r = mapAssignment(BASE, "9", a());
    expect(r).toMatchObject({
      ok: true,
      value: { canvasAssignmentId: "101", canvasCourseId: "9", title: "Lab report", complete: false, defaultEstimate: 45 },
    });
  });

  it("skips undated and unpublished work instead of inventing data", () => {
    expect(mapAssignment(BASE, "9", a({ due_at: null }))).toEqual({ ok: false, reason: "NO_DUE_DATE" });
    expect(mapAssignment(BASE, "9", a({ published: false }))).toEqual({ ok: false, reason: "UNPUBLISHED" });
  });

  it("trims and bounds titles", () => {
    const r = mapAssignment(BASE, "9", a({ name: `  ${"x".repeat(300)}  ` }));
    expect(r.ok && r.value.title.length).toBe(160);
  });
});
