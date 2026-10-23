import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

// The one email + password check, shared by the web login form and the
// native-app token endpoint (/api/v1/auth/token), so both behave the same.

/** Sign-in attempts on one account from all addresses together: 30 per 15 minutes.
 * Shared by the web login and the native-app token endpoint, so a botnet spread
 * over many addresses still gets few guesses at one password. */
export const LOGIN_ACCOUNT_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };

// A throwaway hash, made once, for logins to accounts that don't exist.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash() {
  if (dummyHashPromise === undefined) {
    dummyHashPromise = hashPassword("not-a-real-password-for-timing-only");
  }
  return dummyHashPromise;
}

export interface VerifiedUser {
  id: string;
  onboardingCompletedAt: Date | null;
  sessionVersion: number;
}

/**
 * The user if the email exists and the password matches; otherwise null.
 * Callers must show the same message for both failure cases, so the check
 * never reveals which emails have accounts. When the account doesn't exist
 * the password is compared against a throwaway hash, so both paths take the
 * same bcrypt time and response timing reveals nothing either.
 * `email` must already be normalized (LoginSchema trims and lowercases it).
 */
export async function verifyCredentials(email: string, password: string): Promise<VerifiedUser | null> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, onboardingCompletedAt: true, sessionVersion: true },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !valid) return null;
  return { id: user.id, onboardingCompletedAt: user.onboardingCompletedAt, sessionVersion: user.sessionVersion };
}
