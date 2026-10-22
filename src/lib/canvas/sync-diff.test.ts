import { describe, it, expect } from "vitest";
import { diffCanvasAssignments, diffHasChanges, type ExistingCanvasRow, type FetchedCourse } from "./sync-diff";
import type { MappedAssignment } from "./mapping";

const DUE = new Date("2026-10-24T06:59:00Z");

function mapped(overrides: Partial<MappedAssignment> = {}): MappedAssignment {
  return {
    canvasAssignmentId: "101",
    canvasCourseId: "9",
    title: "Lab report",
    dueAt: DUE,
    pointsPossible: 10,
    canvasUrl: "https://school.instructure.com/courses/9/assignments/101",
    complete: false,
    completionMarker: null,
    defaultEstimate: 45,
    ...overrides,
  };
}

function row(overrides: Partial<ExistingCanvasRow> = {}): ExistingCanvasRow {
  return {
    id: "row-101",
    canvasCourseId: "9",
    canvasAssignmentId: "101",
    title: "Lab report",
    dueAt: DUE,
    pointsPossible: 10,
    canvasUrl: "https://school.instructure.com/courses/9/assignments/101",
    status: "NOT_STARTED",
    canvasSubmittedAt: null,
    canvasRemovedAt: null,
    estimatedByRushd: true,
    estimatedMinutes: 45,
    ...overrides,
  };
}

function course(assignments: MappedAssignment[], overrides: Partial<FetchedCourse> = {}): FetchedCourse {
  return { canvasCourseId: "9", classId: "class-chem", ok: true, assignments, skipped: [], ...overrides };
}

describe("diffCanvasAssignments", () => {
  it("creates new assignments into the course's class", () => {
    const d = diffCanvasAssignments([], [course([mapped(), mapped({ canvasAssignmentId: "102", title: "Quiz" })])]);
    expect(d.creates).toHaveLength(2);
    expect(d.creates[0].classId).toBe("class-chem");
    expect(d.counts.created).toBe(2);
  });

  it("is idempotent: syncing the same data again changes nothing", () => {
    const d = diffCanvasAssignments([row()], [course([mapped()])]);
    expect(diffHasChanges(d)).toBe(false);
    expect(d.counts.unchanged).toBe(1);
  });

  it("updates title and due date from Canvas (Canvas owns those fields)", () => {
    const newDue = new Date("2026-10-26T06:59:00Z");
    const d = diffCanvasAssignments([row()], [course([mapped({ title: "Lab report (revised)", dueAt: newDue })])]);
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].data).toEqual({ title: "Lab report (revised)", dueAt: newDue });
    expect(d.updates[0].kinds).toEqual(["details"]);
  });

  it("marks work complete when Canvas reports a new submission", () => {
    const at = new Date("2026-10-22T18:00:00Z");
    const d = diffCanvasAssignments([row()], [course([mapped({ complete: true, completionMarker: at })])]);
    expect(d.updates[0].data).toMatchObject({ status: "COMPLETED", completedAt: at, canvasSubmittedAt: at });
    expect(d.counts.completed).toBe(1);
  });

  it("does not re-complete work the student reopened, until Canvas reports a newer submission", () => {
    const at = new Date("2026-10-22T18:00:00Z");
    const reopened = row({ status: "IN_PROGRESS", canvasSubmittedAt: at });
    const same = diffCanvasAssignments([reopened], [course([mapped({ complete: true, completionMarker: at })])]);
    expect(diffHasChanges(same)).toBe(false);

    const newer = new Date("2026-10-23T09:00:00Z");
    const resubmitted = diffCanvasAssignments([reopened], [course([mapped({ complete: true, completionMarker: newer })])]);
    expect(resubmitted.updates[0].data.status).toBe("COMPLETED");
  });

  it("never un-completes work in Rushd when Canvas shows no submission", () => {
    const done = row({ status: "COMPLETED", canvasSubmittedAt: new Date("2026-10-22T18:00:00Z") });
    const d = diffCanvasAssignments([done], [course([mapped({ complete: false })])]);
    expect(d.updates[0].data).toEqual({ canvasSubmittedAt: null });
    expect(d.updates[0].data).not.toHaveProperty("status");
  });

  it("keeps a student-chosen estimate but refreshes Rushd's own default", () => {
    const studentChosen = diffCanvasAssignments(
      [row({ estimatedByRushd: false, estimatedMinutes: 200 })],
      [course([mapped({ defaultEstimate: 90 })])],
    );
    expect(diffHasChanges(studentChosen)).toBe(false);

    const rushdDefault = diffCanvasAssignments([row()], [course([mapped({ defaultEstimate: 90 })])]);
    expect(rushdDefault.updates[0].data).toEqual({ estimatedMinutes: 90 });
  });

  it("marks assignments Canvas no longer lists as removed — but only for courses that synced OK", () => {
    const gone = diffCanvasAssignments([row()], [course([])]);
    expect(gone.removes).toEqual([{ id: "row-101", title: "Lab report" }]);

    const failed = diffCanvasAssignments([row()], [course([], { ok: false })]);
    expect(diffHasChanges(failed)).toBe(false);
  });

  it("restores an assignment that reappears", () => {
    const d = diffCanvasAssignments([row({ canvasRemovedAt: new Date() })], [course([mapped()])]);
    expect(d.updates[0].data).toEqual({ canvasRemovedAt: null });
    expect(d.counts.restored).toBe(1);
  });

  it("doesn't touch rows from courses that weren't part of this sync", () => {
    const other = row({ id: "other", canvasCourseId: "77" });
    const d = diffCanvasAssignments([other], [course([])]);
    expect(diffHasChanges(d)).toBe(false);
  });

  it("counts skipped work so the student knows what wasn't imported", () => {
    const d = diffCanvasAssignments([], [
      course([], { skipped: [{ id: "1", reason: "NO_DUE_DATE" }, { id: "2", reason: "UNPUBLISHED" }] }),
    ]);
    expect(d.counts.skippedNoDueDate).toBe(1);
    expect(d.counts.skippedUnpublished).toBe(1);
  });

  it("de-duplicates repeated ids within one response", () => {
    const d = diffCanvasAssignments([], [course([mapped(), mapped()])]);
    expect(d.creates).toHaveLength(1);
  });
});
