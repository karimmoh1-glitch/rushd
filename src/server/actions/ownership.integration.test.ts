import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";

// These exercise the exact query *pattern* every mutation in
// src/server/actions/{classes,assignments,exams}.ts relies on for
// ownership: `updateMany`/`deleteMany` scoped to `{ id, userId }`, so a
// row owned by someone else matches zero rows instead of leaking a
// separate "forbidden" signal. The Server Actions themselves read the
// user id from the request-scoped session cookie (via requireUserOrThrow),
// which isn't available outside a real Next request — so this tests the
// underlying guarantee directly against Postgres rather than mocking
// Next's request context.
describe("cross-user ownership isolation (integration)", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  async function twoUsersWithAClass() {
    const owner = await createTestUser({ displayName: "Owner" });
    const attacker = await createTestUser({ displayName: "Attacker" });
    userIds.push(owner.id, attacker.id);

    const cls = await db.class.create({
      data: { userId: owner.id, name: "Owner's class", color: "#2563eb" },
    });

    return { owner, attacker, cls };
  }

  it("a class update scoped to the wrong userId affects zero rows", async () => {
    const { attacker, cls } = await twoUsersWithAClass();

    const result = await db.class.updateMany({
      where: { id: cls.id, userId: attacker.id },
      data: { name: "Hijacked" },
    });

    expect(result.count).toBe(0);
    const unchanged = await db.class.findUnique({ where: { id: cls.id } });
    expect(unchanged?.name).toBe("Owner's class");
  });

  it("a class delete scoped to the wrong userId affects zero rows", async () => {
    const { attacker, cls } = await twoUsersWithAClass();

    const result = await db.class.deleteMany({
      where: { id: cls.id, userId: attacker.id },
    });

    expect(result.count).toBe(0);
    const stillThere = await db.class.findUnique({ where: { id: cls.id } });
    expect(stillThere).not.toBeNull();
  });

  it("an assignment update scoped to the wrong userId affects zero rows", async () => {
    const { owner, attacker, cls } = await twoUsersWithAClass();
    const assignment = await db.assignment.create({
      data: {
        userId: owner.id,
        classId: cls.id,
        title: "Owner's assignment",
        dueAt: new Date(),
        estimatedMinutes: 30,
      },
    });

    const result = await db.assignment.updateMany({
      where: { id: assignment.id, userId: attacker.id },
      data: { status: "COMPLETED" },
    });

    expect(result.count).toBe(0);
    const unchanged = await db.assignment.findUnique({ where: { id: assignment.id } });
    expect(unchanged?.status).toBe("NOT_STARTED");
  });

  it("the same-owner update succeeds (sanity check the pattern isn't just broken)", async () => {
    const { owner, cls } = await twoUsersWithAClass();

    const result = await db.class.updateMany({
      where: { id: cls.id, userId: owner.id },
      data: { name: "Renamed" },
    });

    expect(result.count).toBe(1);
    const updated = await db.class.findUnique({ where: { id: cls.id } });
    expect(updated?.name).toBe("Renamed");
  });

  it("a class-owning query never returns another user's class by id alone", async () => {
    const { attacker, cls } = await twoUsersWithAClass();

    const found = await db.class.findFirst({
      where: { id: cls.id, userId: attacker.id },
    });

    expect(found).toBeNull();
  });
});
