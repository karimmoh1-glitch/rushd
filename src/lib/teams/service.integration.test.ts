import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { connectTeams, disconnectTeams, runTeamsSync, setSelectedTeamsClasses } from "./service";

// Real database, vault, and sync logic; Microsoft's token endpoint and Graph
// are scripted. NOTE: no live Microsoft tenant is exercised here.

beforeAll(() => {
  process.env.MICROSOFT_CLIENT_ID ??= "test-client";
  process.env.MICROSOFT_CLIENT_SECRET ??= "test-secret";
});

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

interface Script {
  refreshValid: boolean;
  assignments: object[];
  issued: string[];
}

function fakeMicrosoft(script: Script): typeof fetch {
  let n = 0;
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/oauth2/v2.0/token")) {
      const params = new URLSearchParams(String(init?.body));
      if (params.get("grant_type") === "refresh_token" && !script.refreshValid) {
        return json({ error: "invalid_grant", error_description: "AADSTS70008: expired" }, 400);
      }
      const refresh = `refresh-${++n}-${"x".repeat(40)}`;
      script.issued.push(refresh);
      return json({ access_token: `access-${n}`, refresh_token: refresh, expires_in: 3600 });
    }
    if (url.endsWith("/me?$select=displayName")) return json({ displayName: "Sam Student" });
    if (url.includes("/education/me/classes")) {
      return json({ value: [{ id: "cls-chem", displayName: "AP Chemistry" }, { id: "cls-hist", displayName: "US History" }] });
    }
    if (url.includes("/education/me/assignments")) return json({ value: script.assignments });
    return json({}, 404);
  }) as typeof fetch;
}

const assignment = (id: string, over: object = {}) => ({
  id,
  classId: "cls-chem",
  displayName: `Teams ${id}`,
  dueDateTime: iso(3),
  status: "assigned",
  webUrl: "https://teams.microsoft.com/l/entity/x",
  grading: { maxPoints: 20 },
  submissions: [{ status: "working" }],
  ...over,
});

describe("Microsoft Teams service (real DB, scripted Microsoft)", { timeout: 90_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function connected(script: Script) {
    const u = await createTestUser({ displayName: "Teams" });
    users.push(u.id);
    const r = await connectTeams(u.id, "auth-code", "v".repeat(43), { fetchImpl: fakeMicrosoft(script) });
    expect(r).toMatchObject({ ok: true, value: { accountName: "Sam Student", classCount: 2 } });
    return u.id;
  }

  it("stores only an encrypted refresh token and the class list", async () => {
    const script: Script = { refreshValid: true, assignments: [], issued: [] };
    const id = await connected(script);
    const conn = await db.teamsConnection.findUniqueOrThrow({ where: { userId: id }, include: { classes: true } });
    expect(conn.encryptedRefreshToken).not.toContain(script.issued[0]);
    expect(conn.encryptedRefreshToken.startsWith("v1.")).toBe(true);
    expect(conn.classes.map((c) => c.name).sort()).toEqual(["AP Chemistry", "US History"]);
  });

  it("syncs selected classes idempotently, marks turned-in work, and drops what Teams removed", async () => {
    const script: Script = {
      refreshValid: true,
      issued: [],
      assignments: [
        assignment("a1"),
        assignment("a2", { submissions: [{ status: "submitted" }] }),
        assignment("a3", { dueDateTime: null }),
        assignment("a4", { status: "draft" }),
        assignment("h1", { classId: "cls-hist" }),
        assignment("a5", { webUrl: "https://evil.example/phish" }),
      ],
    };
    const id = await connected(script);
    const rows = await db.teamsClass.findMany({ where: { connection: { userId: id } } });
    await setSelectedTeamsClasses(id, rows.filter((r) => r.teamsClassId === "cls-chem").map((r) => r.id));

    const first = await runTeamsSync(id, { fetchImpl: fakeMicrosoft(script) });
    expect(first).toMatchObject({ ok: true, value: { created: 3, completed: 1, skippedNoDueDate: 1 } });
    const created = await db.assignment.findMany({ where: { userId: id, source: "TEAMS" }, orderBy: { teamsAssignmentId: "asc" } });
    expect(created.map((a) => a.teamsAssignmentId)).toEqual(["a1", "a2", "a5"]);
    expect(created.find((a) => a.teamsAssignmentId === "a2")?.status).toBe("COMPLETED");
    expect(created.find((a) => a.teamsAssignmentId === "a5")?.canvasUrl).toBeNull();

    // The refresh token was rotated and the newest one stored.
    const conn = await db.teamsConnection.findUniqueOrThrow({ where: { userId: id } });
    expect(conn.encryptedRefreshToken).not.toContain(script.issued.at(-1)!);

    script.assignments = [assignment("a1", { displayName: "Renamed" }), assignment("a2", { submissions: [{ status: "submitted" }] })];
    const second = await runTeamsSync(id, { fetchImpl: fakeMicrosoft(script) });
    expect(second).toMatchObject({ ok: true, value: { created: 0, updated: 2, removed: 1 } });
    expect(await db.assignment.count({ where: { userId: id, source: "TEAMS" } })).toBe(3);
    expect((await db.assignment.findFirstOrThrow({ where: { userId: id, teamsAssignmentId: "a1" } })).title).toBe("Renamed");
    expect((await db.assignment.findFirstOrThrow({ where: { userId: id, teamsAssignmentId: "a5" } })).canvasRemovedAt).not.toBeNull();
  });

  it("flags the connection for reconnecting when Microsoft rejects the refresh token", async () => {
    const script: Script = { refreshValid: true, assignments: [assignment("a1")], issued: [] };
    const id = await connected(script);
    const rows = await db.teamsClass.findMany({ where: { connection: { userId: id } } });
    await setSelectedTeamsClasses(id, rows.map((r) => r.id));
    script.refreshValid = false;
    const r = await runTeamsSync(id, { fetchImpl: fakeMicrosoft(script) });
    expect(r.ok).toBe(false);
    expect((await db.teamsConnection.findUniqueOrThrow({ where: { userId: id } })).status).toBe("NEEDS_REAUTH");
  });

  it("won't select another student's classes, and disconnect deletes the token", async () => {
    const script: Script = { refreshValid: true, assignments: [assignment("a1")], issued: [] };
    const a = await connected(script);
    const b = await connected(script);
    const aRows = await db.teamsClass.findMany({ where: { connection: { userId: a } } });
    await setSelectedTeamsClasses(b, aRows.map((r) => r.id));
    expect(await db.teamsClass.count({ where: { connection: { userId: a }, selected: true } })).toBe(0);

    await setSelectedTeamsClasses(a, aRows.map((r) => r.id));
    await runTeamsSync(a, { fetchImpl: fakeMicrosoft(script) });
    await disconnectTeams(a, false);
    expect(await db.teamsConnection.findUnique({ where: { userId: a } })).toBeNull();
    const kept = await db.assignment.findFirstOrThrow({ where: { userId: a, title: "Teams a1" } });
    expect(kept).toMatchObject({ source: "MANUAL", teamsAssignmentId: null });
  });
});
