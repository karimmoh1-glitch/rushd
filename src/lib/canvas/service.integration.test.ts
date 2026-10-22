import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import {
  connectCanvas,
  setSelectedCanvasCourses,
  runCanvasSync,
  disconnectCanvas,
  getCanvasConnectionView,
  refreshCanvasCourses,
} from "./service";
import { CanvasApiError, type CanvasAssignment, type CanvasCourse, type CanvasClient } from "./client";

// A scripted stand-in for Canvas. Everything else — the vault, the diff, the
// transactions, the authorization scoping — is the real code against the
// real database. NOTE: this does not exercise a live Canvas instance.

const BASE = "https://school.instructure.com";
const TOKEN = "7~IntegrationTestTokenAbcdefghijklmnop";

interface FakeCanvasState {
  validToken: string;
  courses: CanvasCourse[];
  assignments: Record<string, CanvasAssignment[]>;
  failCourse?: string;
}

function fakeCanvas(state: FakeCanvasState) {
  return (baseUrl: string, token: string) =>
    ({
      async getSelf() {
        if (token !== state.validToken) throw new CanvasApiError("UNAUTHORIZED", "Canvas rejected this token.", 401);
        return { id: 555, name: "Sam Student" };
      },
      async listCourses() {
        if (token !== state.validToken) throw new CanvasApiError("UNAUTHORIZED", "Canvas rejected this token.", 401);
        return state.courses;
      },
      async listAssignments(courseId: string) {
        if (token !== state.validToken) throw new CanvasApiError("UNAUTHORIZED", "Canvas rejected this token.", 401);
        if (state.failCourse === String(courseId)) throw new CanvasApiError("FORBIDDEN", "No access.", 403);
        void baseUrl;
        return state.assignments[String(courseId)] ?? [];
      },
      async close() {},
    }) as unknown as CanvasClient;
}

function assignment(id: number, overrides: Partial<CanvasAssignment> = {}): CanvasAssignment {
  return {
    id,
    course_id: 1,
    name: `Assignment ${id}`,
    due_at: "2026-11-06T07:59:00Z",
    points_possible: 10,
    html_url: `${BASE}/courses/1/assignments/${id}`,
    published: true,
    submission_types: ["online_upload"],
    submission: { workflow_state: "unsubmitted", submitted_at: null },
    ...overrides,
  };
}

let state: FakeCanvasState;
let userA: { id: string };
let userB: { id: string };

beforeEach(async () => {
  state = {
    validToken: TOKEN,
    courses: [
      { id: 1, name: "AP Chemistry", course_code: "CHEM-AP", term: { id: 1, name: "Fall 2026", start_at: null, end_at: null } },
      { id: 2, name: "US History", course_code: "HIST" },
    ],
    assignments: {
      "1": [assignment(101), assignment(102, { name: "Titration lab", points_possible: 100 }), assignment(103, { due_at: null })],
      "2": [assignment(201, { course_id: 2, html_url: `${BASE}/courses/2/assignments/201` })],
    },
  };
  userA = await createTestUser({ displayName: "Canvas A" });
  userB = await createTestUser({ displayName: "Canvas B" });
});

afterEach(async () => {
  await deleteTestUser(userA.id);
  await deleteTestUser(userB.id);
});

async function connectAndSelectAll(userId: string) {
  const deps = { createClient: fakeCanvas(state) };
  const connected = await connectCanvas(userId, "school.instructure.com", TOKEN, deps);
  expect(connected.ok).toBe(true);
  const view = await getCanvasConnectionView(userId);
  await setSelectedCanvasCourses(userId, view!.courses.map((c) => c.id));
  return deps;
}

// Multi-step flows make dozens of round trips to the remote test database.
describe("Canvas service (real DB, scripted Canvas)", { timeout: 60_000 }, () => {
  it("connects, stores the token only as user-bound ciphertext, and lists courses", async () => {
    const r = await connectCanvas(userA.id, "https://school.instructure.com/courses/1", TOKEN, {
      createClient: fakeCanvas(state),
    });
    expect(r).toEqual({ ok: true, value: { canvasUserName: "Sam Student", courseCount: 2 } });

    const row = await db.canvasConnection.findUnique({ where: { userId: userA.id } });
    expect(row?.baseUrl).toBe(BASE);
    expect(row?.encryptedToken).not.toContain(TOKEN);
    expect(row?.encryptedToken.startsWith("v1.")).toBe(true);

    // The client-facing view exposes no secret material at all.
    const view = await getCanvasConnectionView(userA.id);
    expect(JSON.stringify(view)).not.toContain(row!.encryptedToken);
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view?.courses.map((c) => c.name).sort()).toEqual(["AP Chemistry", "US History"]);
  });

  it("returns a helpful error for an invalid token and stores nothing", async () => {
    const r = await connectCanvas(userA.id, BASE, "7~WrongTokenWrongTokenWrong", { createClient: fakeCanvas(state) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("UNAUTHORIZED");
      expect(r.error).toMatch(/didn't accept that token/);
    }
    expect(await db.canvasConnection.findUnique({ where: { userId: userA.id } })).toBeNull();
  });

  it("rejects unsafe base URLs before contacting anything", async () => {
    let contacted = false;
    const r = await connectCanvas(userA.id, "http://169.254.169.254", TOKEN, {
      createClient: () => {
        contacted = true;
        return fakeCanvas(state)(BASE, TOKEN);
      },
    });
    expect(r.ok).toBe(false);
    expect(contacted).toBe(false);
  });

  it("previews without writing, then imports — and a second sync creates no duplicates", async () => {
    const deps = await connectAndSelectAll(userA.id);

    const preview = await runCanvasSync(userA.id, { dryRun: true, ...deps });
    expect(preview.ok && preview.value.summary.created).toBe(3); // 103 has no due date
    expect(preview.ok && preview.value.summary.skippedNoDueDate).toBe(1);
    expect(preview.ok && preview.value.impact).not.toBeNull();
    expect(await db.assignment.count({ where: { userId: userA.id, source: "CANVAS" } })).toBe(0);

    const first = await runCanvasSync(userA.id, { dryRun: false, ...deps });
    expect(first.ok && first.value.applied).toBe(true);
    expect(await db.assignment.count({ where: { userId: userA.id, source: "CANVAS" } })).toBe(3);

    const imported = await db.assignment.findFirst({
      where: { userId: userA.id, canvasAssignmentId: "102" },
      select: { title: true, estimatedMinutes: true, estimatedByRushd: true, class: { select: { name: true } }, dueAt: true },
    });
    expect(imported).toMatchObject({ title: "Titration lab", estimatedMinutes: 135, estimatedByRushd: true });
    expect(imported?.class.name).toBe("AP Chemistry");
    expect(imported?.dueAt.toISOString()).toBe("2026-11-06T07:59:00.000Z"); // exact instant, no shift

    const second = await runCanvasSync(userA.id, { dryRun: false, ...deps });
    expect(second.ok && second.value.summary.created).toBe(0);
    expect(second.ok && second.value.summary.unchanged).toBe(3);
    expect(await db.assignment.count({ where: { userId: userA.id, source: "CANVAS" } })).toBe(3);
  });

  it("applies updates, completions and removals — and never touches manual work", async () => {
    const deps = await connectAndSelectAll(userA.id);
    await runCanvasSync(userA.id, { dryRun: false, ...deps });

    const chem = await db.class.findFirstOrThrow({ where: { userId: userA.id, name: "AP Chemistry" } });
    const manual = await db.assignment.create({
      data: { userId: userA.id, classId: chem.id, title: "My own study guide", dueAt: new Date("2026-11-01T00:00:00Z") },
    });

    // Canvas changes: 101 renamed + new due date, 102 submitted, 201 deleted.
    state.assignments["1"][0] = assignment(101, { name: "Assignment 101 (v2)", due_at: "2026-11-08T07:59:00Z" });
    state.assignments["1"][1] = assignment(102, {
      name: "Titration lab",
      points_possible: 100,
      submission: { workflow_state: "submitted", submitted_at: "2026-10-30T20:00:00Z" },
    });
    state.assignments["2"] = [];

    const r = await runCanvasSync(userA.id, { dryRun: false, ...deps });
    expect(r.ok && r.value.summary).toMatchObject({ updated: 2, completed: 1, removed: 1 });

    const a101 = await db.assignment.findFirstOrThrow({ where: { userId: userA.id, canvasAssignmentId: "101" } });
    expect(a101.title).toBe("Assignment 101 (v2)");
    expect(a101.dueAt.toISOString()).toBe("2026-11-08T07:59:00.000Z");
    const a102 = await db.assignment.findFirstOrThrow({ where: { userId: userA.id, canvasAssignmentId: "102" } });
    expect(a102.status).toBe("COMPLETED");
    const a201 = await db.assignment.findFirstOrThrow({ where: { userId: userA.id, canvasAssignmentId: "201" } });
    expect(a201.canvasRemovedAt).not.toBeNull(); // kept, but out of the plan

    const stillManual = await db.assignment.findUniqueOrThrow({ where: { id: manual.id } });
    expect(stillManual).toMatchObject({ source: "MANUAL", title: "My own study guide", canvasRemovedAt: null });
  });

  it("leaves a course's assignments alone when that course fails to load", async () => {
    const deps = await connectAndSelectAll(userA.id);
    await runCanvasSync(userA.id, { dryRun: false, ...deps });
    state.failCourse = "2";
    const r = await runCanvasSync(userA.id, { dryRun: false, ...deps });
    expect(r.ok && r.value.summary.coursesFailed).toBe(1);
    const a201 = await db.assignment.findFirstOrThrow({ where: { userId: userA.id, canvasAssignmentId: "201" } });
    expect(a201.canvasRemovedAt).toBeNull();
    const conn = await db.canvasConnection.findUniqueOrThrow({ where: { userId: userA.id } });
    expect(conn.lastSyncStatus).toBe("partial");
  });

  it("isolates users: B cannot see, sync, or select A's Canvas data", async () => {
    const deps = await connectAndSelectAll(userA.id);
    await runCanvasSync(userA.id, { dryRun: false, ...deps });

    expect(await getCanvasConnectionView(userB.id)).toBeNull();
    const bSync = await runCanvasSync(userB.id, { dryRun: false, ...deps });
    expect(bSync.ok).toBe(false);

    // B passing A's course row ids does nothing — they're scoped to B's (absent) connection.
    const aCourseIds = (await getCanvasConnectionView(userA.id))!.courses.map((c) => c.id);
    const bSelect = await setSelectedCanvasCourses(userB.id, aCourseIds);
    expect(bSelect.ok).toBe(false);
    expect(await db.assignment.count({ where: { userId: userB.id } })).toBe(0);

    // A's ciphertext copied onto B's account can't be used (AAD binds it to A).
    const aConn = await db.canvasConnection.findUniqueOrThrow({ where: { userId: userA.id } });
    await db.canvasConnection.create({ data: { userId: userB.id, baseUrl: BASE, encryptedToken: aConn.encryptedToken } });
    const stolen = await refreshCanvasCourses(userB.id, deps);
    expect(stolen.ok).toBe(false);
  });

  it("marks the connection for re-auth when Canvas revokes the token", async () => {
    const deps = await connectAndSelectAll(userA.id);
    state.validToken = "7~TheTokenWasRotatedElsewhere0000";
    const r = await runCanvasSync(userA.id, { dryRun: false, ...deps });
    expect(r.ok).toBe(false);
    const conn = await db.canvasConnection.findUniqueOrThrow({ where: { userId: userA.id } });
    expect(conn.status).toBe("NEEDS_REAUTH");
    expect(conn.syncStartedAt).toBeNull(); // lock released
  });

  it("refuses a second concurrent sync", async () => {
    const deps = await connectAndSelectAll(userA.id);
    await db.canvasConnection.update({ where: { userId: userA.id }, data: { syncStartedAt: new Date() } });
    const r = await runCanvasSync(userA.id, { dryRun: false, ...deps });
    expect(r.ok === false && r.code).toBe("LOCKED");
  });

  it("disconnect deletes the credential; imported work kept or removed by choice", async () => {
    const deps = await connectAndSelectAll(userA.id);
    await runCanvasSync(userA.id, { dryRun: false, ...deps });

    const keep = await disconnectCanvas(userA.id, { removeImported: false });
    expect(keep).toEqual({ ok: true, value: { removedAssignments: 0 } });
    expect(await db.canvasConnection.findUnique({ where: { userId: userA.id } })).toBeNull();
    expect(await db.canvasCourse.count({ where: { connection: { userId: userA.id } } })).toBe(0);
    expect(await db.assignment.count({ where: { userId: userA.id, source: "CANVAS" } })).toBe(3);

    // With no connection, sync can't run — synchronization has stopped.
    expect((await runCanvasSync(userA.id, { dryRun: false, ...deps })).ok).toBe(false);

    await connectAndSelectAll(userA.id);
    const remove = await disconnectCanvas(userA.id, { removeImported: true });
    expect(remove.ok && remove.value.removedAssignments).toBe(3);
    expect(await db.assignment.count({ where: { userId: userA.id, source: "CANVAS" } })).toBe(0);
  });
});
