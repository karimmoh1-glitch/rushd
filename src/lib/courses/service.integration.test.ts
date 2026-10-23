import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { createCourse, setCourseArchived, toDateInput, updateCourse } from "./service";

const base = { name: "AP Chemistry", color: "#2563eb", priority: "MEDIUM" as const };

describe("courses (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });
  async function student() {
    const u = await createTestUser();
    users.push(u.id);
    return u.id;
  }

  it("saves course details, and editing can change or clear them", async () => {
    const userId = await student();
    const created = await createCourse(userId, {
      ...base,
      level: "AP",
      code: "CHEM 101",
      institution: "Lincoln High",
      subject: "Science",
      termStart: "2026-08-25",
      termEnd: "2026-12-18",
      weeklyHours: 5,
      teacher: "Ms. Rivera",
    });
    if (!created.ok) throw new Error(created.error);
    const saved = await db.class.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved).toMatchObject({ level: "AP", code: "CHEM 101", institution: "Lincoln High", weeklyHours: 5, teacher: "Ms. Rivera" });
    expect(toDateInput(saved.termStart)).toBe("2026-08-25");
    expect(toDateInput(saved.termEnd)).toBe("2026-12-18");

    // Clearing fields in the form clears them in the database.
    const edited = await updateCourse(userId, created.id, { ...base, name: "Chemistry", level: "HIGH_SCHOOL", teacher: "" });
    expect(edited.ok).toBe(true);
    const after = await db.class.findUniqueOrThrow({ where: { id: created.id } });
    expect(after).toMatchObject({ name: "Chemistry", level: "HIGH_SCHOOL", code: null, institution: null, termStart: null, weeklyHours: null, teacher: null });
  });

  it("never touches another student's course", async () => {
    const owner = await student();
    const other = await student();
    const created = await createCourse(owner, base);
    if (!created.ok) throw new Error(created.error);
    expect(await updateCourse(other, created.id, { ...base, name: "Hijacked" })).toEqual({ ok: false, error: "Class not found." });
    expect(await setCourseArchived(other, created.id, true)).toEqual({ ok: false, error: "Class not found." });
    expect(await db.class.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ name: "AP Chemistry", archived: false });
  });

  it("archiving and restoring keep the course's work", async () => {
    const userId = await student();
    const created = await createCourse(userId, base);
    if (!created.ok) throw new Error(created.error);
    await db.assignment.create({ data: { userId, classId: created.id, title: "Lab report", dueAt: new Date(Date.now() + 86_400_000) } });
    await db.exam.create({ data: { userId, classId: created.id, title: "Unit test", examAt: new Date(Date.now() + 5 * 86_400_000) } });

    await setCourseArchived(userId, created.id, true);
    expect((await db.class.findUniqueOrThrow({ where: { id: created.id } })).archived).toBe(true);
    await setCourseArchived(userId, created.id, false);
    const course = await db.class.findUniqueOrThrow({
      where: { id: created.id },
      include: { _count: { select: { assignments: true, exams: true } } },
    });
    expect(course.archived).toBe(false);
    expect(course._count).toEqual({ assignments: 1, exams: 1 });
  });

  it("rejects invalid input without writing anything", async () => {
    const userId = await student();
    const bad = await createCourse(userId, { ...base, termStart: "2026-12-18", termEnd: "2026-08-25" });
    expect(bad).toEqual({ ok: false, error: "The term can't end before it starts." });
    expect(await db.class.count({ where: { userId } })).toBe(0);
  });
});
