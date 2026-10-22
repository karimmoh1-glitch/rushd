import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSessionFromCookies } from "@/lib/auth/session";

// Verifies the session cookie's signature only — no database round trip, so
// it cannot see revocation. Use getCurrentUser for anything that matters.
export const verifySession = cache(async () => {
  const session = await readSessionFromCookies();
  if (!session?.userId) return null;
  return { userId: session.userId, sessionVersion: session.sv ?? 0 };
});

// The trusted source of "who is the current user." Every server action and
// protected page should derive identity from here, never from client input.
export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      onboardingCompletedAt: true,
      sessionVersion: true,
      profile: { select: { displayName: true, timezone: true } },
    },
  });

  // A password change or "sign out everywhere" bumps the version, which
  // voids every token issued before it.
  if (!user || user.sessionVersion !== session.sessionVersion) return null;
  return user;
});

// Call from a Server Component or Server Action that must not proceed
// without an authenticated user. Redirects rather than throwing so pages can
// use it directly.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}

// For Server Actions, which should fail loudly rather than redirect a POST.
export async function requireUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
