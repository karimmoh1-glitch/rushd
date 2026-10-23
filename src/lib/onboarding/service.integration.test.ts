import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { completeOnboardingFor } from "./service";
import type { OnboardingInput } from "@/lib/validation/onboarding-setup";

// A fresh, not-yet-onboarded student (createTestUser makes onboarded ones).
async function newStudent(): Promise<string> {
  const user = await db.user.create({
    data: { email: `integration-test-onb-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: await hashPassword("password123") },
  });
  return user.id;
}

const now = new Date("2026-10-22T15:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

function input(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    displayName: "Maya",
    studyLevel: "HIGH_SCHOOL",
    timezone: "America/Los_Angeles",
    availability: [{ dayOfWeek: 1, startMinute: 960, endMinute: 1080 }],
    courses: [
      { name: "AP Chemistry", color: "#2563eb", priority: "MEDIUM", level: "AP", subject: "Science", catalogId: "ap-chemistry", termStart: "2026-08-25", termEnd: "2026-12-18", institution: "Lincoln High" },
      { name: "Calculus I", color: "#7c3aed", priority: "MEDIUM", level: "DUAL_ENROLLMENT", subject: "Math", catalogId: "col-calculus-i" },
      { name: "Marine Robotics Lab", color: "#0d9488", priority: "MEDIUM", level: "HIGH_SCHOOL" },
    ],
    work: [
      { kind: "assignment", title: "Titration lab report", courseIndex: 0, dueAt: inDays(2), minutes: 120 },
      { kind: "exam", title: "Limits quiz", courseIndex: 1, dueAt: inDays(4), minutes: 60 },
      { kind: "assignment", title: "Way in the past", courseIndex: 2, dueAt: inDays(-90), minutes: 30 },
    ],
    preferredSessionMinutes: 45,
    emailReminders: true,
    ...overrides,
  };
}

describe("onboarding (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  it("saves level, courses with details and catalog ids, work, and study time in one go", async () => {
    const userId = await newStudent();
    users.push(userId);
    const outcome = await completeOnboardingFor(userId, input(), now);
    expect(outcome).toEqual({ ok: true, alreadyDone: false, courseCount: 3, workCount: 2, availabilityWindowCount: 1 });

    const profile = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(profile).toMatchObject({ displayName: "Maya", studyLevel: "HIGH_SCHOOL", preferredSessionMinutes: 45, emailReminders: true });
    const classes = await db.class.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    expect(classes.map((c) => [c.name, c.catalogId, c.level])).toEqual([
      ["AP Chemistry", "ap-chemistry", "AP"],
      ["Calculus I", "col-calculus-i", "DUAL_ENROLLMENT"],
      ["Marine Robotics Lab", null, "HIGH_SCHOOL"],
    ]);
    expect(classes[0]).toMatchObject({ institution: "Lincoln High" });
    expect(classes[0].termEnd?.toISOString().slice(0, 10)).toBe("2026-12-18");

    const chem = classes[0].id;
    const calc = classes[1].id;
    expect(await db.assignment.findMany({ where: { userId }, select: { title: true, classId: true, estimatedMinutes: true } })).toEqual([
      { title: "Titration lab report", classId: chem, estimatedMinutes: 120 },
    ]);
    expect(await db.exam.findMany({ where: { userId }, select: { title: true, classId: true, prepMinutes: true } })).toEqual([{ title: "Limits quiz", classId: calc, prepMinutes: 60 }]);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).onboardingCompletedAt).toEqual(now);
  });

  it("logs events with catalog ids and counts only, never typed text", async () => {
    const userId = await newStudent();
    users.push(userId);
    await completeOnboardingFor(userId, input(), now);
    const events = await db.event.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    const added = events.filter((e) => e.name === "course_added").map((e) => e.properties);
    expect(added).toEqual([
      { catalogId: "ap-chemistry", custom: false, level: "AP", via: "onboarding" },
      { catalogId: "col-calculus-i", custom: false, level: "DUAL_ENROLLMENT", via: "onboarding" },
      { catalogId: null, custom: true, level: "HIGH_SCHOOL", via: "onboarding" },
    ]);
    const completed = events.find((e) => e.name === "onboarding_completed")!.properties as Record<string, unknown>;
    expect(completed).toMatchObject({ level: "HIGH_SCHOOL", classCount: 3, catalogCourseCount: 2, customCourseCount: 1, coursesWithDetails: 1, workItemCount: 2 });
    expect(typeof completed.timeToCompleteSeconds).toBe("number");
    expect(JSON.stringify(events.map((e) => e.properties))).not.toMatch(/Marine|Titration|Lincoln|Maya/);
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(["assignment_created", "exam_created"]));
  });

  it("is a no-op the second time, so a double submit can't duplicate anything", async () => {
    const userId = await newStudent();
    users.push(userId);
    await completeOnboardingFor(userId, input(), now);
    const again = await completeOnboardingFor(userId, input(), now);
    expect(again).toMatchObject({ ok: true, alreadyDone: true });
    expect(await db.class.count({ where: { userId } })).toBe(3);
    expect(await db.assignment.count({ where: { userId } })).toBe(1);
  });

  it("allows skipping everything but the basics", async () => {
    const userId = await newStudent();
    users.push(userId);
    const outcome = await completeOnboardingFor(userId, { displayName: "", timezone: "America/New_York", availability: [], courses: [], work: [] }, now);
    expect(outcome).toMatchObject({ ok: true, courseCount: 0 });
    expect((await db.profile.findUniqueOrThrow({ where: { userId } })).displayName).toBe("");
  });

  it("rejects bad input without writing anything", async () => {
    const userId = await newStudent();
    users.push(userId);
    const badTerm = input({
      courses: [{ name: "AP Chemistry", color: "#2563eb", priority: "MEDIUM", termStart: "2026-12-18", termEnd: "2026-08-25" }],
      work: [],
    });
    expect(await completeOnboardingFor(userId, badTerm, now)).toEqual({ ok: false, error: "The term can't end before it starts." });
    const badCatalog = input({ courses: [{ name: "Fake", color: "#2563eb", priority: "MEDIUM", catalogId: "made-up-course" }], work: [] });
    expect(await completeOnboardingFor(userId, badCatalog, now)).toEqual({ ok: false, error: "Unknown catalog course." });
    const badIndex = input({ work: [{ kind: "assignment", title: "Orphan", courseIndex: 7, dueAt: inDays(1), minutes: 30 }] });
    expect(await completeOnboardingFor(userId, badIndex, now)).toEqual({ ok: false, error: "Every item needs one of your courses." });
    expect(await db.class.count({ where: { userId } })).toBe(0);
    expect(await db.profile.count({ where: { userId } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).onboardingCompletedAt).toBeNull();
  });

  it("writes only under the signed-in student's id", async () => {
    const other = await createTestUser();
    users.push(other.id);
    const userId = await newStudent();
    users.push(userId);
    await completeOnboardingFor(userId, input(), now);
    expect(await db.class.count({ where: { userId: other.id } })).toBe(0);
    expect(await db.assignment.count({ where: { userId: other.id } })).toBe(0);
    // Every work item points at a course the same student owns.
    const items = await db.assignment.findMany({ where: { userId }, select: { class: { select: { userId: true } } } });
    expect(items.every((item) => item.class.userId === userId)).toBe(true);
  });
});
