import type { MappedAssignment, SkipReason } from "./mapping";

// The pure heart of Canvas sync: given what Rushd already has and what Canvas
// just returned, decide exactly what to change. No I/O — so the rules that
// protect a student's data are unit-tested directly (sync-diff.test.ts).
//
// Ground rules:
//  * Canvas owns title, due date, points and link for Canvas-sourced rows.
//  * The student owns priority, notes, and any estimate they chose.
//  * Completion flows Canvas -> Rushd once per new submission; a student who
//    reopens work in Rushd isn't overridden until Canvas reports a newer one.
//  * Work that disappears from a course is marked removed (kept, but out of
//    the plan) — only when that course was fetched successfully and fully.
//  * MANUAL rows are never part of this diff at all.

export interface ExistingCanvasRow {
  id: string;
  canvasCourseId: string;
  canvasAssignmentId: string;
  title: string;
  dueAt: Date;
  pointsPossible: number | null;
  canvasUrl: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  canvasSubmittedAt: Date | null;
  canvasRemovedAt: Date | null;
  estimatedByRushd: boolean;
  estimatedMinutes: number;
}

export interface FetchedCourse {
  canvasCourseId: string;
  classId: string;
  /** False when the course fetch failed — its rows are left untouched. */
  ok: boolean;
  assignments: MappedAssignment[];
  skipped: { id: string; reason: SkipReason }[];
}

export interface CreateOp {
  classId: string;
  mapped: MappedAssignment;
}

export type UpdateKind = "details" | "completed" | "restored" | "estimate" | "reopened-in-canvas";

export interface UpdateOp {
  id: string;
  title: string;
  kinds: UpdateKind[];
  data: {
    title?: string;
    dueAt?: Date;
    pointsPossible?: number | null;
    canvasUrl?: string | null;
    canvasRemovedAt?: null;
    status?: "COMPLETED";
    completedAt?: Date;
    canvasSubmittedAt?: Date | null;
    estimatedMinutes?: number;
  };
}

export interface RemoveOp {
  id: string;
  title: string;
}

export interface SyncDiff {
  creates: CreateOp[];
  updates: UpdateOp[];
  removes: RemoveOp[];
  counts: {
    created: number;
    createdAlreadyComplete: number;
    updated: number;
    completed: number;
    removed: number;
    restored: number;
    unchanged: number;
    skippedNoDueDate: number;
    skippedUnpublished: number;
  };
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

export function diffCanvasAssignments(
  existing: ExistingCanvasRow[],
  courses: FetchedCourse[],
): SyncDiff {
  const creates: CreateOp[] = [];
  const updates: UpdateOp[] = [];
  const removes: RemoveOp[] = [];
  const counts: SyncDiff["counts"] = {
    created: 0,
    createdAlreadyComplete: 0,
    updated: 0,
    completed: 0,
    removed: 0,
    restored: 0,
    unchanged: 0,
    skippedNoDueDate: 0,
    skippedUnpublished: 0,
  };

  const byKey = new Map(existing.map((r) => [`${r.canvasCourseId}:${r.canvasAssignmentId}`, r]));

  for (const course of courses) {
    if (!course.ok) continue;
    for (const s of course.skipped) {
      if (s.reason === "NO_DUE_DATE") counts.skippedNoDueDate++;
      else counts.skippedUnpublished++;
    }

    const seen = new Set<string>();
    for (const m of course.assignments) {
      const key = `${course.canvasCourseId}:${m.canvasAssignmentId}`;
      if (seen.has(key)) continue; // Canvas shouldn't repeat ids; be safe anyway
      seen.add(key);
      const row = byKey.get(key);

      if (!row) {
        creates.push({ classId: course.classId, mapped: m });
        counts.created++;
        if (m.complete) counts.createdAlreadyComplete++;
        continue;
      }

      const data: UpdateOp["data"] = {};
      const kinds = new Set<UpdateKind>();

      if (row.title !== m.title) data.title = m.title;
      if (row.dueAt.getTime() !== m.dueAt.getTime()) data.dueAt = m.dueAt;
      if (row.pointsPossible !== m.pointsPossible) data.pointsPossible = m.pointsPossible;
      if (row.canvasUrl !== m.canvasUrl) data.canvasUrl = m.canvasUrl;
      if (Object.keys(data).length > 0) kinds.add("details");

      if (row.canvasRemovedAt) {
        data.canvasRemovedAt = null;
        kinds.add("restored");
      }

      if (m.complete) {
        if (!sameTime(row.canvasSubmittedAt, m.completionMarker)) {
          data.canvasSubmittedAt = m.completionMarker;
          if (row.status !== "COMPLETED") {
            data.status = "COMPLETED";
            data.completedAt =
              m.completionMarker && m.completionMarker.getUTCFullYear() > 1970 ? m.completionMarker : new Date();
            kinds.add("completed");
          }
        }
      } else if (row.canvasSubmittedAt) {
        // Canvas no longer shows a submission (e.g. the teacher reopened it):
        // forget the old marker so the next real submission counts as new.
        // Rushd's own status is left alone — the student decides that.
        data.canvasSubmittedAt = null;
        kinds.add("reopened-in-canvas");
      }

      if (row.estimatedByRushd && row.estimatedMinutes !== m.defaultEstimate) {
        data.estimatedMinutes = m.defaultEstimate;
        kinds.add("estimate");
      }

      if (kinds.size === 0) {
        counts.unchanged++;
        continue;
      }
      updates.push({ id: row.id, title: m.title, kinds: [...kinds], data });
      counts.updated++;
      if (kinds.has("completed")) counts.completed++;
      if (kinds.has("restored")) counts.restored++;
    }

    // Anything this course used to have that Canvas no longer lists (or now
    // lists without a due date) leaves the plan — but is kept.
    for (const row of existing) {
      if (row.canvasCourseId !== course.canvasCourseId) continue;
      if (row.canvasRemovedAt) continue;
      if (seen.has(`${row.canvasCourseId}:${row.canvasAssignmentId}`)) continue;
      removes.push({ id: row.id, title: row.title });
      counts.removed++;
    }
  }

  return { creates, updates, removes, counts };
}

/** True when applying the diff would change anything at all. */
export function diffHasChanges(d: SyncDiff): boolean {
  return d.creates.length + d.updates.length + d.removes.length > 0;
}
