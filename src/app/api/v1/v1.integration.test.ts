import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { digestToken, signAccessToken } from "@/lib/api/v1/tokens";
import * as tokenRoute from "./auth/token/route";
import * as refreshRoute from "./auth/refresh/route";
import * as logoutRoute from "./auth/logout/route";
import * as meRoute from "./me/route";
import * as todayRoute from "./today/route";
import * as assignmentsRoute from "./assignments/route";
import * as assignmentRoute from "./assignments/[id]/route";
import * as coursesRoute from "./courses/route";
import * as courseRoute from "./courses/[id]/route";
import * as sessionsRoute from "./sessions/route";
import * as activeSessionRoute from "./sessions/active/route";
import * as completeRoute from "./sessions/[id]/complete/route";
import * as abandonRoute from "./sessions/[id]/abandon/route";

// The native-app API, end to end through the real route handlers and the
// local database: token auth (issue, rotate, reuse detection, revoke,
// forged/expired tokens) and every endpoint's ownership scoping.

const DAY = 24 * 60 * 60 * 1000;

/** A fresh client IP per test, so rate-limit buckets never carry over between runs. */
function randomIp(): string {
  const b = randomBytes(3);
  return `10.${b[0]}.${b[1]}.${b[2]}`;
}

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  ip?: string;
  headers?: Record<string, string>;
  query?: string;
}

function request(path: string, options: CallOptions = {}): Request {
  const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? randomIp(), ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost/api/v1${path}${options.query ?? ""}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

async function body(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("/api/v1 (integration)", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  async function user(name = "Student") {
    const created = await createTestUser({ displayName: name });
    userIds.push(created.id);
    return created;
  }

  async function signIn(email: string, password = "password123", deviceName = "Test iPhone") {
    const response = await tokenRoute.POST(request("/auth/token", { method: "POST", body: { email, password, deviceName } }));
    expect(response.status).toBe(200);
    return body(response) as Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresAt: string }>;
  }

  async function withCourseAndAssignment(userId: string) {
    const course = await db.class.create({ data: { userId, name: "Chemistry", color: "#0d9488", code: "CHEM 101", level: "UNIVERSITY" } });
    const assignment = await db.assignment.create({
      data: { userId, classId: course.id, title: "Lab report", dueAt: new Date(Date.now() + 2 * DAY), estimatedMinutes: 45 },
    });
    return { course, assignment };
  }

  // ---------- Auth ----------

  describe("POST /auth/token", () => {
    it("issues an access token and a refresh token that is stored only as a hash", async () => {
      const student = await user();
      const tokens = await signIn(student.email);
      expect(tokens.accessToken.split(".")).toHaveLength(3);
      expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(new Date(tokens.accessTokenExpiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);

      const rows = await db.mobileRefreshToken.findMany({ where: { userId: student.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toBe(digestToken(tokens.refreshToken));
      expect(rows[0].tokenHash).not.toContain(tokens.refreshToken);
      expect(rows[0].deviceLabel).toBe("Test iPhone");
      expect(rows[0].sessionVersion).toBe(0);
      expect(rows[0].revokedAt).toBeNull();
    });

    it("answers a wrong password and an unknown email identically", async () => {
      const student = await user();
      const wrong = await tokenRoute.POST(request("/auth/token", { method: "POST", body: { email: student.email, password: "nope-nope-1" } }));
      const unknown = await tokenRoute.POST(
        request("/auth/token", { method: "POST", body: { email: `nobody-${Date.now()}@example.com`, password: "nope-nope-1" } }),
      );
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(await body(wrong)).toEqual(await body(unknown));
      expect(await body(await tokenRoute.POST(request("/auth/token", { method: "POST", body: { email: student.email, password: "x" } })))).toEqual({
        error: { code: "invalid_credentials", message: "Invalid email or password." },
      });
    });

    it("rejects a malformed body with invalid_request", async () => {
      const response = await tokenRoute.POST(request("/auth/token", { method: "POST", body: { email: "not-an-email" } }));
      expect(response.status).toBe(400);
      expect((await body(response)).error.code).toBe("invalid_request");
      const notJson = await tokenRoute.POST(
        new Request("http://localhost/api/v1/auth/token", { method: "POST", headers: { "x-forwarded-for": randomIp() }, body: "{" }),
      );
      expect(notJson.status).toBe(400);
    });

    it("shares the web login's per-email limit: the 11th attempt from one IP is refused", async () => {
      const student = await user();
      const ip = randomIp();
      for (let i = 0; i < 10; i++) {
        const response = await tokenRoute.POST(request("/auth/token", { method: "POST", ip, body: { email: student.email, password: "wrong-pass-1" } }));
        expect(response.status).toBe(401);
      }
      const limited = await tokenRoute.POST(request("/auth/token", { method: "POST", ip, body: { email: student.email, password: "password123" } }));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBeTruthy();
      expect((await body(limited)).error.code).toBe("rate_limited");
    });
  });

  describe("bearer authentication", () => {
    it("requires a token", async () => {
      const response = await meRoute.GET(request("/me"));
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({ error: { code: "unauthorized", message: "Sign in to continue." } });
    });

    it("accepts a valid token and returns the student", async () => {
      const student = await user("Layla");
      const { accessToken } = await signIn(student.email);
      const response = await meRoute.GET(request("/me", { token: accessToken }));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const data = await body(response);
      expect(data.user).toMatchObject({ id: student.id, email: student.email, displayName: "Layla", onboardingCompleted: true });
    });

    it("rejects a forged token signed with another key", async () => {
      const student = await user();
      const forged = await new SignJWT({ sv: 0, fam: "x", typ: "access" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(student.id)
        .setIssuer("rushd")
        .setAudience("rushd-api-v1")
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(new TextEncoder().encode("some-other-secret-that-is-long-enough"));
      expect((await meRoute.GET(request("/me", { token: forged }))).status).toBe(401);
    });

    it("rejects a web session cookie token used as a bearer token", async () => {
      const student = await user();
      const cookieToken = await new SignJWT({ userId: student.id, sv: 0 })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
      expect((await meRoute.GET(request("/me", { token: cookieToken }))).status).toBe(401);
    });

    it("rejects a tampered token", async () => {
      const student = await user();
      const other = await user("Other");
      const { accessToken } = await signIn(student.email);
      const [header, payload, signature] = accessToken.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      claims.sub = other.id;
      const tampered = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
      expect((await meRoute.GET(request("/me", { token: tampered }))).status).toBe(401);
    });

    it("answers an expired token with token_expired", async () => {
      const student = await user();
      await signIn(student.email);
      const family = await db.mobileRefreshToken.findFirstOrThrow({ where: { userId: student.id } });
      const { token } = await signAccessToken(
        { userId: student.id, sessionVersion: 0, familyId: family.familyId },
        new Date(Date.now() - 20 * 60 * 1000),
      );
      const response = await meRoute.GET(request("/me", { token }));
      expect(response.status).toBe(401);
      expect((await body(response)).error.code).toBe("token_expired");
    });

    it("stops accepting access tokens once the web signs out everywhere (session version bump)", async () => {
      const student = await user();
      const { accessToken, refreshToken } = await signIn(student.email);
      await db.user.update({ where: { id: student.id }, data: { sessionVersion: { increment: 1 } } });
      expect((await meRoute.GET(request("/me", { token: accessToken }))).status).toBe(401);
      const refreshed = await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken } }));
      expect(refreshed.status).toBe(401);
      expect((await body(refreshed)).error.code).toBe("refresh_token_invalid");
    });
  });

  describe("POST /auth/refresh", () => {
    it("rotates the refresh token and keeps working with the new pair", async () => {
      const student = await user();
      const first = await signIn(student.email);
      const response = await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: first.refreshToken } }));
      expect(response.status).toBe(200);
      const second = await body(response);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect((await meRoute.GET(request("/me", { token: second.accessToken }))).status).toBe(200);

      const old = await db.mobileRefreshToken.findUniqueOrThrow({ where: { tokenHash: digestToken(first.refreshToken) } });
      const current = await db.mobileRefreshToken.findUniqueOrThrow({ where: { tokenHash: digestToken(second.refreshToken) } });
      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).toBe(current.id);
      expect(current.familyId).toBe(old.familyId);
      expect(current.deviceLabel).toBe("Test iPhone");
    });

    it("detects reuse of a rotated token and revokes the whole sign-in", async () => {
      const student = await user();
      const first = await signIn(student.email);
      const second = await body(await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: first.refreshToken } })));

      const replay = await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: first.refreshToken } }));
      expect(replay.status).toBe(401);
      expect((await body(replay)).error.code).toBe("refresh_token_reused");

      // The legitimate holder's newer tokens die with the family.
      const afterReuse = await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: second.refreshToken } }));
      expect(afterReuse.status).toBe(401);
      expect((await meRoute.GET(request("/me", { token: second.accessToken }))).status).toBe(401);
      const active = await db.mobileRefreshToken.count({ where: { userId: student.id, revokedAt: null } });
      expect(active).toBe(0);
    });

    it("leaves other sign-ins alone when one family is revoked for reuse", async () => {
      const student = await user();
      const phone = await signIn(student.email, "password123", "Phone");
      const tablet = await signIn(student.email, "password123", "Tablet");
      await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: phone.refreshToken } }));
      await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: phone.refreshToken } }));
      expect((await meRoute.GET(request("/me", { token: tablet.accessToken }))).status).toBe(200);
    });

    it("refuses unknown, malformed, and expired refresh tokens", async () => {
      const student = await user();
      const unknown = await refreshRoute.POST(
        request("/auth/refresh", { method: "POST", body: { refreshToken: randomBytes(32).toString("base64url") } }),
      );
      expect(unknown.status).toBe(401);
      expect((await body(unknown)).error.code).toBe("refresh_token_invalid");
      expect((await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: "short" } }))).status).toBe(401);

      const { refreshToken } = await signIn(student.email);
      await db.mobileRefreshToken.updateMany({ where: { userId: student.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken } }));
      expect(expired.status).toBe(401);
      expect((await body(expired)).error.code).toBe("refresh_token_invalid");
    });
  });

  describe("POST /auth/logout", () => {
    it("ends this sign-in: its refresh and access tokens stop working", async () => {
      const student = await user();
      const { accessToken, refreshToken } = await signIn(student.email);
      const response = await logoutRoute.POST(request("/auth/logout", { method: "POST", body: { refreshToken } }));
      expect(response.status).toBe(204);
      expect((await meRoute.GET(request("/me", { token: accessToken }))).status).toBe(401);
      expect((await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken } }))).status).toBe(401);
    });

    it("signs out everywhere: every device and the web session version", async () => {
      const student = await user();
      const phone = await signIn(student.email, "password123", "Phone");
      const tablet = await signIn(student.email, "password123", "Tablet");
      const response = await logoutRoute.POST(request("/auth/logout", { method: "POST", token: phone.accessToken, body: { everywhere: true } }));
      expect(response.status).toBe(204);
      expect((await meRoute.GET(request("/me", { token: tablet.accessToken }))).status).toBe(401);
      expect((await refreshRoute.POST(request("/auth/refresh", { method: "POST", body: { refreshToken: tablet.refreshToken } }))).status).toBe(401);
      const fresh = await db.user.findUniqueOrThrow({ where: { id: student.id } });
      expect(fresh.sessionVersion).toBe(1);
    });

    it("requires a valid access token to sign out everywhere", async () => {
      const response = await logoutRoute.POST(request("/auth/logout", { method: "POST", body: { everywhere: true } }));
      expect(response.status).toBe(401);
    });
  });

  // ---------- Resources ----------

  describe("GET /today", () => {
    it("returns next up with reasons, coming up with due status, and the week", async () => {
      const student = await user();
      const { assignment } = await withCourseAndAssignment(student.id);
      const { accessToken } = await signIn(student.email);
      const response = await todayRoute.GET(request("/today", { token: accessToken }));
      expect(response.status).toBe(200);
      const { today } = await body(response);
      expect(today.timeZone).toBe("America/Los_Angeles");
      expect(today.nextUp).toMatchObject({ itemId: assignment.id, kind: "assignment", title: "Lab report", courseName: "Chemistry" });
      expect(today.nextUp.reasons.length).toBeGreaterThan(0);
      expect(today.comingUp[0]).toMatchObject({ id: assignment.id, dueStatus: "soon" });
      expect(today.week.days.length).toBeGreaterThan(0);
      expect(today.todayEmpty.noAvailability).toBe(true);
    });

    it("never shows another student's work", async () => {
      const owner = await user("Owner");
      const other = await user("Other");
      await withCourseAndAssignment(owner.id);
      const { accessToken } = await signIn(other.email);
      const { today } = await body(await todayRoute.GET(request("/today", { token: accessToken })));
      expect(today.nextUp).toBeNull();
      expect(today.comingUp).toEqual([]);
    });
  });

  describe("assignments", () => {
    it("lists open work ranked, and completed work separately", async () => {
      const student = await user();
      const { course, assignment } = await withCourseAndAssignment(student.id);
      const overdue = await db.assignment.create({
        data: { userId: student.id, classId: course.id, title: "Late essay", dueAt: new Date(Date.now() - DAY), estimatedMinutes: 30 },
      });
      await db.assignment.create({
        data: { userId: student.id, classId: course.id, title: "Done", dueAt: new Date(), status: "COMPLETED", completedAt: new Date() },
      });
      const { accessToken } = await signIn(student.email);

      const open = await body(await assignmentsRoute.GET(request("/assignments", { token: accessToken })));
      expect(open.assignments.map((a: { id: string }) => a.id)).toEqual([overdue.id, assignment.id]);
      expect(open.assignments[0]).toMatchObject({ dueStatus: "overdue", course: { name: "Chemistry" } });
      expect(open.assignments[0].pulse).toBeGreaterThan(0);

      const done = await body(await assignmentsRoute.GET(request("/assignments", { token: accessToken, query: "?status=completed" })));
      expect(done.assignments.map((a: { title: string }) => a.title)).toEqual(["Done"]);
      expect((await assignmentsRoute.GET(request("/assignments", { token: accessToken, query: "?status=bogus" }))).status).toBe(400);
    });

    it("creates an assignment in the student's own course only", async () => {
      const student = await user();
      const other = await user("Other");
      const { course } = await withCourseAndAssignment(student.id);
      const { course: othersCourse } = await withCourseAndAssignment(other.id);
      const { accessToken } = await signIn(student.email);
      const dueAt = new Date(Date.now() + 3 * DAY).toISOString();

      const created = await assignmentsRoute.POST(
        request("/assignments", { method: "POST", token: accessToken, body: { courseId: course.id, title: "Problem set 4", dueAt } }),
      );
      expect(created.status).toBe(201);
      const { assignment } = await body(created);
      expect(assignment).toMatchObject({ title: "Problem set 4", estimatedMinutes: 30, priority: "MEDIUM", status: "NOT_STARTED" });
      expect(await db.assignment.count({ where: { id: assignment.id, userId: student.id } })).toBe(1);

      const intoOthers = await assignmentsRoute.POST(
        request("/assignments", { method: "POST", token: accessToken, body: { courseId: othersCourse.id, title: "Sneaky", dueAt } }),
      );
      expect(intoOthers.status).toBe(404);
      expect(await db.assignment.count({ where: { classId: othersCourse.id, title: "Sneaky" } })).toBe(0);

      const invalid = await assignmentsRoute.POST(
        request("/assignments", { method: "POST", token: accessToken, body: { courseId: course.id, title: "", dueAt } }),
      );
      expect(invalid.status).toBe(400);
      expect((await body(invalid)).error.message).toContain("title");
    });

    it("marks done and not done, and edits fields", async () => {
      const student = await user();
      const { assignment } = await withCourseAndAssignment(student.id);
      const { accessToken } = await signIn(student.email);

      const done = await body(
        await assignmentRoute.PATCH(request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: { status: "COMPLETED" } }), ctx(assignment.id)),
      );
      expect(done.assignment.status).toBe("COMPLETED");
      expect(done.assignment.completedAt).not.toBeNull();

      const undone = await body(
        await assignmentRoute.PATCH(request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: { status: "NOT_STARTED" } }), ctx(assignment.id)),
      );
      expect(undone.assignment).toMatchObject({ status: "NOT_STARTED", completedAt: null });

      const edited = await body(
        await assignmentRoute.PATCH(
          request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: { title: "Lab report (final)", estimatedMinutes: 90, notes: "Graphs" } }),
          ctx(assignment.id),
        ),
      );
      expect(edited.assignment).toMatchObject({ title: "Lab report (final)", estimatedMinutes: 90, notes: "Graphs", status: "NOT_STARTED" });

      const empty = await assignmentRoute.PATCH(request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: {} }), ctx(assignment.id));
      expect(empty.status).toBe(400);
    });

    it("answers 404 for another student's assignment and leaves it untouched", async () => {
      const owner = await user("Owner");
      const attacker = await user("Attacker");
      const { assignment } = await withCourseAndAssignment(owner.id);
      const { course: attackersCourse } = await withCourseAndAssignment(attacker.id);
      const { accessToken } = await signIn(attacker.email);

      expect((await assignmentRoute.GET(request(`/assignments/${assignment.id}`, { token: accessToken }), ctx(assignment.id))).status).toBe(404);
      const patch = await assignmentRoute.PATCH(
        request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: { status: "COMPLETED" } }),
        ctx(assignment.id),
      );
      expect(patch.status).toBe(404);
      expect((await body(patch)).error.code).toBe("not_found");
      const moveIn = await assignmentRoute.PATCH(
        request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: { courseId: attackersCourse.id } }),
        ctx(assignment.id),
      );
      expect(moveIn.status).toBe(404);
      const fresh = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect(fresh.status).toBe("NOT_STARTED");
      expect(fresh.classId).toBe(assignment.classId);
    });

    it("can't move an assignment into another student's course", async () => {
      const student = await user();
      const other = await user("Other");
      const { assignment } = await withCourseAndAssignment(student.id);
      const { course: othersCourse } = await withCourseAndAssignment(other.id);
      const { accessToken } = await signIn(student.email);
      const response = await assignmentRoute.PATCH(
        request(`/assignments/${assignment.id}`, { method: "PATCH", token: accessToken, body: { courseId: othersCourse.id } }),
        ctx(assignment.id),
      );
      expect(response.status).toBe(404);
      expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).classId).toBe(assignment.classId);
    });
  });

  describe("courses", () => {
    it("lists courses with identity and counts, and shows one course's work", async () => {
      const student = await user();
      const { course, assignment } = await withCourseAndAssignment(student.id);
      await db.class.update({ where: { id: course.id }, data: { termStart: new Date("2026-08-25"), termEnd: new Date("2026-12-18"), weeklyHours: 4 } });
      const { accessToken } = await signIn(student.email);

      const { courses } = await body(await coursesRoute.GET(request("/courses", { token: accessToken })));
      expect(courses).toHaveLength(1);
      expect(courses[0]).toMatchObject({
        id: course.id,
        name: "Chemistry",
        code: "CHEM 101",
        levelLabel: expect.any(String),
        weeklyGoalMinutes: 240,
        openAssignmentCount: 1,
        termStart: "2026-08-25",
      });

      const detail = await body(await courseRoute.GET(request(`/courses/${course.id}`, { token: accessToken }), ctx(course.id)));
      expect(detail.course.id).toBe(course.id);
      expect(detail.openAssignments.map((a: { id: string }) => a.id)).toEqual([assignment.id]);
    });

    it("answers 404 for another student's course and never lists it", async () => {
      const owner = await user("Owner");
      const other = await user("Other");
      const { course } = await withCourseAndAssignment(owner.id);
      const { accessToken } = await signIn(other.email);
      expect((await courseRoute.GET(request(`/courses/${course.id}`, { token: accessToken }), ctx(course.id))).status).toBe(404);
      const { courses } = await body(await coursesRoute.GET(request("/courses", { token: accessToken })));
      expect(courses).toEqual([]);
    });
  });

  describe("study sessions", () => {
    it("starts, reports active, refuses a second, and completes once", async () => {
      const student = await user();
      const { assignment } = await withCourseAndAssignment(student.id);
      const { accessToken } = await signIn(student.email);

      const none = await body(await activeSessionRoute.GET(request("/sessions/active", { token: accessToken })));
      expect(none.session).toBeNull();

      const started = await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: { assignmentId: assignment.id } }));
      expect(started.status).toBe(201);
      const { session } = await body(started);
      expect(session).toMatchObject({ title: "Lab report", className: "Chemistry", plannedMinutes: 45 });
      expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("IN_PROGRESS");

      const active = await body(await activeSessionRoute.GET(request("/sessions/active", { token: accessToken })));
      expect(active.session.id).toBe(session.id);

      const second = await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: { assignmentId: assignment.id } }));
      expect(second.status).toBe(409);
      expect((await body(second)).error.code).toBe("conflict");

      const badMinutes = await completeRoute.POST(
        request(`/sessions/${session.id}/complete`, { method: "POST", token: accessToken, body: { actualMinutes: 0 } }),
        ctx(session.id),
      );
      expect(badMinutes.status).toBe(400);

      const completed = await completeRoute.POST(
        request(`/sessions/${session.id}/complete`, { method: "POST", token: accessToken, body: { actualMinutes: 50, difficulty: "HARDER" } }),
        ctx(session.id),
      );
      expect(completed.status).toBe(200);
      expect((await body(completed)).summary).toMatchObject({ plannedMinutes: 45, actualMinutes: 50, perceivedDifficulty: "HARDER" });

      const again = await completeRoute.POST(
        request(`/sessions/${session.id}/complete`, { method: "POST", token: accessToken, body: { actualMinutes: 10 } }),
        ctx(session.id),
      );
      expect(again.status).toBe(409);
    });

    it("abandons with an optional reason", async () => {
      const student = await user();
      const { assignment } = await withCourseAndAssignment(student.id);
      const { accessToken } = await signIn(student.email);
      const { session } = await body(await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: { assignmentId: assignment.id } })));
      const response = await abandonRoute.POST(
        request(`/sessions/${session.id}/abandon`, { method: "POST", token: accessToken, body: { reason: "GOT_DISTRACTED" } }),
        ctx(session.id),
      );
      expect(response.status).toBe(200);
      const row = await db.studySession.findUniqueOrThrow({ where: { id: session.id } });
      expect(row).toMatchObject({ status: "ABANDONED", abandonReason: "GOT_DISTRACTED" });
      expect((await abandonRoute.POST(request(`/sessions/${session.id}/abandon`, { method: "POST", token: accessToken, body: {} }), ctx(session.id))).status).toBe(409);
    });

    it("answers 404 for another student's assignment, exam, and session", async () => {
      const owner = await user("Owner");
      const attacker = await user("Attacker");
      const { course, assignment } = await withCourseAndAssignment(owner.id);
      const exam = await db.exam.create({ data: { userId: owner.id, classId: course.id, title: "Midterm", examAt: new Date(Date.now() + 5 * DAY) } });
      const ownerTokens = await signIn(owner.email);
      const { session } = await body(
        await sessionsRoute.POST(request("/sessions", { method: "POST", token: ownerTokens.accessToken, body: { assignmentId: assignment.id } })),
      );
      const { accessToken } = await signIn(attacker.email);

      expect((await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: { assignmentId: assignment.id } }))).status).toBe(404);
      expect((await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: { examId: exam.id } }))).status).toBe(404);
      expect(
        (await completeRoute.POST(request(`/sessions/${session.id}/complete`, { method: "POST", token: accessToken, body: { actualMinutes: 5 } }), ctx(session.id))).status,
      ).toBe(404);
      expect((await abandonRoute.POST(request(`/sessions/${session.id}/abandon`, { method: "POST", token: accessToken, body: {} }), ctx(session.id))).status).toBe(404);
      const attackersActive = await body(await activeSessionRoute.GET(request("/sessions/active", { token: accessToken })));
      expect(attackersActive.session).toBeNull();
      expect((await db.studySession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("IN_PROGRESS");
    });

    it("rejects a body naming both or neither target", async () => {
      const student = await user();
      const { accessToken } = await signIn(student.email);
      expect((await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: {} }))).status).toBe(400);
      expect(
        (await sessionsRoute.POST(request("/sessions", { method: "POST", token: accessToken, body: { assignmentId: "a", examId: "b" } }))).status,
      ).toBe(400);
    });
  });

  describe("CORS", () => {
    it("answers preflights for local development origins only", async () => {
      const local = await meRoute.OPTIONS(request("/me", { method: "OPTIONS", headers: { origin: "http://localhost:8081" } }));
      expect(local.status).toBe(204);
      expect(local.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
      expect(local.headers.get("access-control-allow-credentials")).toBeNull();
      const foreign = await meRoute.OPTIONS(request("/me", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
      expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
    });
  });
});
