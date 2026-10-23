import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CODE_RE } from "@/lib/referral/constants";

// A shareable study card: streak days and minutes studied this week, signed
// so the numbers can't be edited in the link. Carries the student's invite
// code (never their name), so the card doubles as an invite.

export interface StreakCard {
  code: string;
  streak: number;
  minutes: number;
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

function sig(body: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`share:${body}`).digest("base64url").slice(0, 22);
}

export function encodeStreakCard(card: StreakCard): string {
  const body = `${card.code}-${clamp(card.streak, 999)}-${clamp(card.minutes, 9999)}`;
  return `${body}-${sig(body)}`;
}

export function decodeStreakCard(token: string): StreakCard | null {
  // Format: code-streak-minutes-signature
  const match = token.match(/^([a-z2-9]{8})-(\d{1,3})-(\d{1,4})-([A-Za-z0-9_-]{22})$/);
  if (!match || !process.env.SESSION_SECRET) return null;
  const [, code, streak, minutes, signature] = match;
  if (!CODE_RE.test(code)) return null;

  const given = Buffer.from(signature);
  const expected = Buffer.from(sig(`${code}-${streak}-${minutes}`));
  // Timing-safe compare, so the signature can't be guessed byte by byte.
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;
  return { code, streak: Number(streak), minutes: Number(minutes) };
}

export function formatStudyTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  if (leftoverMinutes > 0) return `${hours}h ${leftoverMinutes}m`;
  return `${hours}h`;
}
