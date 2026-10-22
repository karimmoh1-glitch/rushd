import { timingSafeEqual } from "node:crypto";

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Refuses everything when the secret isn't set. */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
