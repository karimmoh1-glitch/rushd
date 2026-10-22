import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, non-expiring unsubscribe links: the token proves the link came from
// a Rushd email for this account, without a login.

function sign(userId: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`unsubscribe:${userId}`).digest("base64url");
}

export function unsubscribeUrl(appUrl: string, userId: string): string {
  return `${appUrl}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function verifyUnsubscribe(userId: string | null, token: string | null): boolean {
  if (!userId || !token || !process.env.SESSION_SECRET) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(sign(userId));
  return a.length === b.length && timingSafeEqual(a, b);
}
