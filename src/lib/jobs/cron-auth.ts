import { timingSafeEqual } from "node:crypto";

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Refuses everything when the secret isn't set. */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  // Timing-safe compare, so the secret can't be guessed byte by byte.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
