import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { popularCatalogCourses, POPULAR_MIN_STUDENTS, recentOwnCourses } from "./usage";
import { createCourses } from "./service";

// A real-looking account (not @example.com / integration-test-*), so it counts.
async function realStudent(): Promise<string> {
  const user = await db.user.create({
    data: { email: `pop-${Date.now()}-${Math.random().toString(36).slice(2)}@rushd-test.invalid`, passwordHash: await hashPassword("password123") },
  });
  return user.id;
}

// A rarely used catalog id, so other tests' rows don't affect the counts.
const ID = "pro-grant-writing";

describe("course usage (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function chooseBy(count: number) {
    for (let i = 0; i < count; i++) {
      const userId = await realStudent();
      users.push(userId);
      await db.class.create({ data: { userId, name: "Grant Writing", color: "#2563eb", catalogId: ID } });
    }
  }

  it("shows a course as popular only once enough real students chose it", async () => {
    await chooseBy(POPULAR_MIN_STUDENTS - 1);
    // The same student adding it twice counts once.
    await db.class.create({ data: { userId: users[0], name: "Grant Writing again", color: "#2563eb", catalogId: ID } });
    expect((await popularCatalogCourses(200)).some((course) => course.catalogId === ID)).toBe(false);

    await chooseBy(1);
    const popular = await popularCatalogCourses(200);
    expect(popular.find((course) => course.catalogId === ID)).toEqual({ catalogId: ID, students: POPULAR_MIN_STUDENTS });
  });

  it("never counts test or staff accounts", async () => {
    for (let i = 0; i < POPULAR_MIN_STUDENTS; i++) {
      const user = await createTestUser();
      users.push(user.id);
      await db.class.create({ data: { userId: user.id, name: "Grant Writing", color: "#2563eb", catalogId: ID } });
    }
    expect((await popularCatalogCourses(200)).some((course) => course.catalogId === ID)).toBe(false);
  });

  it("recent courses are the student's own, newest first", async () => {
    const owner = await realStudent();
    const other = await realStudent();
    users.push(owner, other);
    await db.class.create({ data: { userId: owner, name: "First", color: "#2563eb", createdAt: new Date("2026-09-01") } });
    await db.class.create({ data: { userId: owner, name: "Second", color: "#2563eb", catalogId: "ap-biology", createdAt: new Date("2026-09-02") } });
    await db.class.create({ data: { userId: other, name: "Not mine", color: "#2563eb" } });
    expect((await recentOwnCourses(owner)).map((course) => [course.name, course.catalogId])).toEqual([
      ["Second", "ap-biology"],
      ["First", null],
    ]);
  });

  it("adds several courses at once, all or nothing, under the student's id", async () => {
    const userId = await realStudent();
    users.push(userId);
    const ok = await createCourses(userId, [
      { name: "AP Biology", color: "#2563eb", priority: "MEDIUM", catalogId: "ap-biology", level: "AP" },
      { name: "Marine Robotics Lab", color: "#7c3aed", priority: "MEDIUM" },
    ]);
    expect(ok.ok).toBe(true);
    expect(await db.class.count({ where: { userId } })).toBe(2);

    const bad = await createCourses(userId, [
      { name: "AP Chemistry", color: "#2563eb", priority: "MEDIUM", catalogId: "ap-chemistry" },
      { name: "Bad", color: "not-a-color", priority: "MEDIUM" },
    ]);
    expect(bad).toEqual({ ok: false, error: "Bad: Invalid color." });
    expect(await db.class.count({ where: { userId } })).toBe(2);
    expect(await createCourses(userId, [])).toEqual({ ok: false, error: "Pick at least one course." });
  });
});
