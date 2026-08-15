import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

let counter = 0;

/** Creates a fully-onboarded test user (User + Profile) for integration
 * tests. Each call gets a unique email so tests can run without colliding. */
export async function createTestUser(overrides?: { displayName?: string }) {
  counter += 1;
  const email = `integration-test-${Date.now()}-${counter}@example.com`;
  const passwordHash = await hashPassword("password123");

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      onboardingCompletedAt: new Date(),
      profile: {
        create: {
          displayName: overrides?.displayName ?? "Test Student",
          timezone: "America/Los_Angeles",
        },
      },
    },
  });

  return user;
}

export async function deleteTestUser(userId: string) {
  await db.user.delete({ where: { id: userId } }).catch(() => {
    // Already deleted by the test itself (e.g. testing deleteAccount) — fine.
  });
}
