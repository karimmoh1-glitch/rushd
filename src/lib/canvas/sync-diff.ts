import type { MappedAssignment, SkipReason } from "./mapping";

// Decides what a Canvas sync should change, given what Rushd has and what
// Canvas returned. No network or database here (tested in sync-diff.test.ts).
// Rules that protect the student's data:
//  - Canvas owns title, due date, points and link. The student owns priority,
//    notes, and any estimate they chose.
//  - A Canvas submission marks work complete once; if the student reopens it in
//    Rushd, we wait for a newer submission before marking it again.
//  - Work missing from a course is marked removed (kept, but out of the plan),
//    and only when that course was fetched successfully.
//  - Manual assignments are never part of this.

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
  /** False when the course fetch failed; its rows are left untouched. */
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

/** True when both dates are the same moment (or both are null). */
function sameTime(a: Date | null, b: Date | null): boolean {
  const timeA = a ? a.getTime() : null;
  const timeB = b ? b.getTime() : null;
  return timeA === timeB;
}

function rowKey(canvasCourseId: string, canvasAssignmentId: string): string {
  return `${canvasCourseId}:${canvasAssignmentId}`;
}

/** Works out the update for one existing row. Returns null when nothing changed. */
function buildUpdate(row: ExistingCanvasRow, mapped: MappedAssignment): UpdateOp | null {
  const data: UpdateOp["data"] = {};
  const kinds = new Set<UpdateKind>();

  if (row.title !== mapped.title) {
    data.title = mapped.title;
  }
  if (row.dueAt.getTime() !== mapped.dueAt.getTime()) {
    data.dueAt = mapped.dueAt;
  }
  if (row.pointsPossible !== mapped.pointsPossible) {
    data.pointsPossible = mapped.pointsPossible;
  }
  if (row.canvasUrl !== mapped.canvasUrl) {
    data.canvasUrl = mapped.canvasUrl;
  }
  if (Object.keys(data).length > 0) {
    kinds.add("details");
  }

  if (row.canvasRemovedAt) {
    data.canvasRemovedAt = null;
    kinds.add("restored");
  }

  if (mapped.complete) {
    // Only a new submission counts, so a student who reopened the work isn't overridden.
    if (!sameTime(row.canvasSubmittedAt, mapped.completionMarker)) {
      data.canvasSubmittedAt = mapped.completionMarker;
      if (row.status !== "COMPLETED") {
        data.status = "COMPLETED";
        const marker = mapped.completionMarker;
        const hasRealTime = marker !== null && marker.getUTCFullYear() > 1970;
        data.completedAt = hasRealTime ? marker : new Date();
        kinds.add("completed");
      }
    }
  } else if (row.canvasSubmittedAt) {
    // Canvas no longer shows a submission (e.g. the teacher reopened it).
    // Forget the old marker so the next real submission counts as new.
    // Rushd's own status is left alone; the student decides that.
    data.canvasSubmittedAt = null;
    kinds.add("reopened-in-canvas");
  }

  if (row.estimatedByRushd && row.estimatedMinutes !== mapped.defaultEstimate) {
    data.estimatedMinutes = mapped.defaultEstimate;
    kinds.add("estimate");
  }

  if (kinds.size === 0) {
    return null;
  }
  return { id: row.id, title: mapped.title, kinds: [...kinds], data };
}

export function diffCanvasAssignments(existing: ExistingCanvasRow[], courses: FetchedCourse[]): SyncDiff {
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

  const existingByKey = new Map<string, ExistingCanvasRow>();
  for (const row of existing) {
    existingByKey.set(rowKey(row.canvasCourseId, row.canvasAssignmentId), row);
  }

  for (const course of courses) {
    if (!course.ok) {
      continue;
    }

    for (const skipped of course.skipped) {
      if (skipped.reason === "NO_DUE_DATE") {
        counts.skippedNoDueDate++;
      } else {
        counts.skippedUnpublished++;
      }
    }

    const seen = new Set<string>();
    for (const mapped of course.assignments) {
      const key = rowKey(course.canvasCourseId, mapped.canvasAssignmentId);
      // Canvas shouldn't repeat ids, but be safe anyway.
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const row = existingByKey.get(key);
      if (!row) {
        creates.push({ classId: course.classId, mapped });
        counts.created++;
        if (mapped.complete) {
          counts.createdAlreadyComplete++;
        }
        continue;
      }

      const update = buildUpdate(row, mapped);
      if (!update) {
        counts.unchanged++;
        continue;
      }
      updates.push(update);
      counts.updated++;
      if (update.kinds.includes("completed")) {
        counts.completed++;
      }
      if (update.kinds.includes("restored")) {
        counts.restored++;
      }
    }

    // Anything this course had that Canvas no longer lists (or lists without
    // a due date) leaves the plan, but is kept.
    for (const row of existing) {
      if (row.canvasCourseId !== course.canvasCourseId) {
        continue;
      }
      if (row.canvasRemovedAt) {
        continue;
      }
      if (seen.has(rowKey(row.canvasCourseId, row.canvasAssignmentId))) {
        continue;
      }
      removes.push({ id: row.id, title: row.title });
      counts.removed++;
    }
  }

  return { creates, updates, removes, counts };
}

/** True when applying the diff would change anything at all. */
export function diffHasChanges(diff: SyncDiff): boolean {
  return diff.creates.length + diff.updates.length + diff.removes.length > 0;
}
