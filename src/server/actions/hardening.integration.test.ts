import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";

// Calls the real server actions with a stand-in request context: a cookie jar
// for the session and request headers for the client address.
const jar = new Map<string, string>();
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => requestHeaders,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const { createSession } = await import("@/lib/auth/session");
const { rateLimitKey } = await import("@/lib/auth/rate-limit");
const { login } = await import("@/server/actions/auth");
const { changePassword } = await import("@/server/actions/settings");
const { commitImportedAssignments } = await import("@/server/actions/import");
const { deleteAssignment, setAssignmentStatus } = await import("@/server/actions/assignments");
const { parseQuickAdd } = await import("@/server/actions/quick-add");
const { submitFeedback } = await import("@/server/actions/feedback");
const { logPlanItemInteraction } = await import("@/server/actions/plan-item-events");

const dueSoon = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

describe("server action hardening (integration)", { timeout: 120_000 }, () => {
  const userIds: string[] = [];
  const bucketKeys: string[] = [];
  afterEach(async () => {
    jar.clear();
    requestHeaders = new Headers();
    await db.rateLimitBucket.deleteMany({ where: { key: { in: bucketKeys.splice(0).map(rateLimitKey) } } });
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  async function signedIn(name: string) {
    const user = await createTestUser({ displayName: name });
    userIds.push(user.id);
    await createSession(user.id, 0);
    return user;
  }

  it("import commit validates every item and keeps ownership checks", async () => {
    const user = await signedIn("Importer");
    bucketKeys.push(`import-commit:${user.id}`);
    const cls = await db.class.create({ data: { userId: user.id, name: "Biology" } });
    const otherUser = await createTestUser({ displayName: "Other" });
    userIds.push(otherUser.id);
    const otherClass = await db.class.create({ data: { userId: otherUser.id, name: "Not yours" } });

    const item = { kind: "assignment" as const, title: "Lab", classId: cls.id, dueAt: dueSoon(), minutes: 30 };
    expect(await commitImportedAssignments("not a list" as never)).toHaveProperty("error");
    expect(await commitImportedAssignments([{ ...item, dueAt: "next tuesday" }])).toHaveProperty("error");
    expect(await commitImportedAssignments([{ ...item, minutes: -5 }])).toHaveProperty("error");
    expect(await commitImportedAssignments([{ ...item, classId: { not: "" } as never }])).toHaveProperty("error");
    expect(await commitImportedAssignments([{ ...item, classId: otherClass.id }])).toEqual({ error: "One of the selected classes wasn't found." });
    expect(await db.assignment.count({ where: { userId: user.id } })).toBe(0);

    expect(await commitImportedAssignments([{ ...item, title: "x".repeat(5000) }])).toEqual({ success: true, created: 1 });
    const saved = await db.assignment.findFirstOrThrow({ where: { userId: user.id } });
    expect(saved.title).toHaveLength(160);
  });

  it("ignores Prisma filter objects passed where an id belongs", async () => {
    const user = await signedIn("Ids");
    const cls = await db.class.create({ data: { userId: user.id, name: "History" } });
    await db.assignment.create({ data: { userId: user.id, classId: cls.id, title: "Essay", dueAt: new Date(dueSoon()) } });

    expect(await deleteAssignment({ not: "" } as never)).toEqual({ error: "Assignment not found." });
    expect(await setAssignmentStatus({ not: "" } as never, "COMPLETED")).toEqual({ error: "Assignment not found." });
    expect(await db.assignment.count({ where: { userId: user.id } })).toBe(1);
  });

  it("limits password guesses on one account across many addresses", async () => {
    const user = await createTestUser({ displayName: "Target" });
    userIds.push(user.id);
    bucketKeys.push(`login-account:${user.email}`);
    const attempt = async (i: number) => {
      requestHeaders = new Headers({ "x-forwarded-for": `198.51.100.${i % 250}` });
      bucketKeys.push(`login:198.51.100.${i % 250}:${user.email}`);
      const form = new FormData();
      form.set("email", user.email);
      form.set("password", `wrong-password-${i}`);
      return login(undefined, form);
    };
    for (let i = 0; i < 30; i++) {
      expect(await attempt(i)).toEqual({ message: "Invalid email or password." });
    }
    expect(await attempt(30)).toEqual({ message: "Too many attempts. Try again in a few minutes." });
  });

  it("limits current-password guesses from a signed-in session", async () => {
    const user = await signedIn("Changer");
    bucketKeys.push(`change-password:${user.id}`);
    const attempt = () => changePassword({ currentPassword: "not-it-123", newPassword: "a new password 1", confirmPassword: "a new password 1" } as never);
    for (let i = 0; i < 5; i++) {
      expect(await attempt()).toEqual({ error: "Current password is incorrect." });
    }
    expect(await attempt()).toEqual({ error: "Too many attempts. Try again in a few minutes." });
  });

  it("quick add never takes unbounded text", async () => {
    const user = await signedIn("Quick");
    bucketKeys.push(`quick-add:${user.id}`);
    const result = await parseQuickAdd(`Read chapter 4 by friday ${"lorem ".repeat(200_000)}`);
    expect(result.usedAI).toBe(false);
    expect(result.draft.title.length).toBeLessThanOrEqual(300);
    // A non-string from a hand-made request doesn't crash the action.
    await expect(parseQuickAdd({ evil: true } as never)).resolves.toHaveProperty("draft");
  });

  it("feedback is rate limited per student", async () => {
    const user = await signedIn("Feedback");
    bucketKeys.push(`feedback:${user.id}`);
    for (let i = 0; i < 20; i++) {
      expect(await submitFeedback({ context: "general", rating: 5 })).toEqual({ success: true });
    }
    expect(await submitFeedback({ context: "general", rating: 5 })).toHaveProperty("error");
    expect(await db.feedback.count({ where: { userId: user.id } })).toBe(20);
  });

  it("plan-item events accept only known values", async () => {
    const user = await signedIn("Events");
    await logPlanItemInteraction("hacked" as never, "x".repeat(100_000), "assignment");
    await logPlanItemInteraction("completed", "item-1", "assignment");
    const names = (await db.event.findMany({ where: { userId: user.id }, select: { name: true } })).map((e) => e.name);
    expect(names).toEqual(["plan_item_completed"]);
  });
});
