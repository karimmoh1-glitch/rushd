import { json, preflight, withUser } from "@/lib/api/v1/http";

// GET /api/v1/me — the signed-in student.

export const OPTIONS = preflight;

export async function GET(request: Request) {
  return withUser(request, async (user) =>
    json(request, {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.profile?.displayName ?? null,
        timeZone: user.profile?.timezone ?? null,
        onboardingCompleted: user.onboardingCompletedAt !== null,
        createdAt: user.createdAt.toISOString(),
      },
    }),
  );
}
