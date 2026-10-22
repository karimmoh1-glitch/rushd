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

function sig(body: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`share:${body}`).digest("base64url").slice(0, 22);
}

export function encodeStreakCard(card: StreakCard): string {
  const body = `${card.code}-${Math.max(0, Math.min(999, Math.round(card.streak)))}-${Math.max(0, Math.min(9999, Math.round(card.minutes)))}`;
  return `${body}-${sig(body)}`;
}

export function decodeStreakCard(token: string): StreakCard | null {
  const m = token.match(/^([a-z2-9]{8})-(\d{1,3})-(\d{1,4})-([A-Za-z0-9_-]{22})$/);
  if (!m || !process.env.SESSION_SECRET || !CODE_RE.test(m[1])) return null;
  const body = `${m[1]}-${m[2]}-${m[3]}`;
  const a = Buffer.from(m[4]);
  const b = Buffer.from(sig(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { code: m[1], streak: Number(m[2]), minutes: Number(m[3]) };
}

export function formatStudyTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
