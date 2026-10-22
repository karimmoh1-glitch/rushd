import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a single-use reset token for a user, voiding any earlier unused
 * ones. Returns the raw token; only its digest is stored. */
export async function issueResetToken(userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({
      data: { userId, tokenHash: digest(token), expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS) },
    }),
  ]);
  return token;
}

export type ResetOutcome = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

/** Sets a new password if the token is valid, unused and unexpired. Marks the
 * token used and bumps the session version, so every existing session (the
 * possibly-compromised ones included) is signed out. */
export async function redeemResetToken(token: string, newPassword: string, now = new Date()): Promise<ResetOutcome> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, reason: "invalid" };
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: digest(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt) return { ok: false, reason: "invalid" };
  if (record.expiresAt <= now) return { ok: false, reason: "expired" };

  const passwordHash = await hashPassword(newPassword);
  // Claim the token atomically so two concurrent submissions can't both win.
  const claimed = await db.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return { ok: false, reason: "invalid" };
  await db.user.update({
    where: { id: record.userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return { ok: true, userId: record.userId };
}
