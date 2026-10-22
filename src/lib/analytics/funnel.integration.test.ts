import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { getGrowth } from "./funnel";

// Real database, scoped to this test's users (the database is shared).

const DAY = 86_400_000;

describe("growth metrics count only real student actions", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  it("ignores page views and background plan refreshes as activity", async () => {
    const now = new Date();
    const signedUp = new Date(now.getTime() - 3 * DAY);
    const make = async () => {
      const u = await createTestUser();
      users.push(u.id);
      await db.user.update({ where: { id: u.id }, data: { createdAt: signedUp } });
      return u.id;
    };
    const browsing = await make();
    const studying = await make();
    const dayOne = new Date(signedUp.getTime() + DAY + 3_600_000);
    await db.event.createMany({
      data: [
        { userId: browsing, name: "dashboard_viewed", createdAt: dayOne },
        { userId: browsing, name: "plan_generated", createdAt: dayOne },
        { userId: studying, name: "assignment_created", createdAt: signedUp },
        { userId: studying, name: "study_session_completed", createdAt: dayOne },
      ],
    });

    const g = await getGrowth(30, now, { userIds: [browsing, studying] });
    expect(g.signups).toBe(2);
    expect(g.firstSetup).toBe(1);
    expect(g.firstStudy).toBe(1);
    expect(g.day1).toEqual({ active: 1, eligible: 2 });
    expect(g.day7).toEqual({ active: 0, eligible: 0 });
  });
});
