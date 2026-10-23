import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { BONUS_MESSAGES, CODE_RE, MAX_FRIENDS } from "./constants";
import { log } from "@/lib/log";

// Invite a friend: when the friend does a real study action, both get
// BONUS_MESSAGES more tutor messages every month. The inviter's bonus counts
// at most MAX_FRIENDS friends.

export { BONUS_MESSAGES, CODE_RE, MAX_FRIENDS };
export const REF_COOKIE = "rushd_ref";
/** Extra monthly AI cost allowed per bonus message, so the bonus is usable on Free's cost cap. */
export const BONUS_COST_PER_MESSAGE_USD = 0.1;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 8 random characters from ALPHABET (no look-alikes such as 0/o or 1/l). */
function newCode(): string {
  let code = "";
  for (const byte of randomBytes(8)) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

async function readReferralCode(userId: string): Promise<string | null> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  return user.referralCode;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await readReferralCode(userId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = newCode();
      // Only set it if still empty, so a parallel request can't overwrite another code.
      const updated = await db.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      if (updated.count === 1) return code;
      // Another request set a code first: use that one.
      return (await readReferralCode(userId))!;
    } catch (error) {
      // P2002 = the random code is already taken by someone else; try a new one.
      const isTaken = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isTaken) throw error;
    }
  }
  throw new Error("Couldn't create an invite code.");
}

/** Records who invited a brand-new account. Silently ignores bad codes. */
export async function attachReferral(newUserId: string, code: string | undefined): Promise<void> {
  if (!code || !CODE_RE.test(code)) return;
  try {
    const referrer = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!referrer || referrer.id === newUserId) return;
    await db.referral.create({ data: { referrerId: referrer.id, referredId: newUserId } });
  } catch (error) {
    log.error("referral.attach_failed", { err: error });
  }
}

/** Called on every real study action; cheap no-op unless this user was invited and hasn't qualified yet. */
export async function qualifyReferral(userId: string): Promise<void> {
  await db.referral.updateMany({ where: { referredId: userId, qualifiedAt: null }, data: { qualifiedAt: new Date() } });
}

type Reader = Prisma.TransactionClient | typeof db;

/** Extra tutor messages per month this student has earned through invites. */
export async function referralBonus(userId: string, client: Reader = db): Promise<number> {
  const [friends, invited] = await Promise.all([
    client.referral.count({ where: { referrerId: userId, qualifiedAt: { not: null } } }),
    client.referral.count({ where: { referredId: userId, qualifiedAt: { not: null } } }),
  ]);
  return (Math.min(friends, MAX_FRIENDS) + invited) * BONUS_MESSAGES;
}

export async function referralStats(userId: string) {
  const [code, joined, qualified, bonus] = await Promise.all([
    getOrCreateReferralCode(userId),
    db.referral.count({ where: { referrerId: userId } }),
    db.referral.count({ where: { referrerId: userId, qualifiedAt: { not: null } } }),
    referralBonus(userId),
  ]);
  return { code, joined, qualified, bonus };
}
