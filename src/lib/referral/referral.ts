import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { BONUS_MESSAGES, MAX_FRIENDS } from "./constants";

// Invite a friend: when the friend does a real study action, both get
// BONUS_MESSAGES more tutor messages every month. The inviter's bonus counts
// at most MAX_FRIENDS friends.

export { BONUS_MESSAGES, MAX_FRIENDS };
export const REF_COOKIE = "rushd_ref";
/** Extra monthly AI cost allowed per bonus message, so the bonus is usable on Free's cost cap. */
export const BONUS_COST_PER_MESSAGE_USD = 0.1;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_RE = /^[a-z2-9]{8}$/;

function newCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = newCode();
      const updated = await db.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      if (updated.count === 1) return code;
      return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode!;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
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
    console.error("[referral] attach failed", (error as Error)?.name ?? typeof error);
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
