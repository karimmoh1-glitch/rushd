import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

// Token auth for native clients (the iPhone app) on /api/v1.
//
// - Access token: a 15-minute HS256 JWT. Its key is derived from
//   SESSION_SECRET for this purpose only, so a web session cookie can never be
//   used as a bearer token or the other way round. It carries the user's
//   session version and the refresh-token family it came from; both are
//   checked against the database on every request, so "sign out everywhere"
//   and "sign out" take effect immediately, not when the token expires.
// - Refresh token: 32 random bytes. Only a SHA-256 digest is stored
//   (MobileRefreshToken). Every refresh rotates it; presenting an already
//   rotated or revoked token revokes the whole family (reuse detection).

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days, renewed on each refresh
const ISSUER = "rushd";
const AUDIENCE = "rushd-api-v1";

const accessKey = createHmac("sha256", env.SESSION_SECRET).update("rushd/api-v1/access-token").digest();

export interface AccessClaims {
  userId: string;
  sessionVersion: number;
  familyId: string;
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: "Bearer";
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signAccessToken(claims: AccessClaims, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((issuedAt + ACCESS_TOKEN_TTL_SECONDS) * 1000);
  const token = await new SignJWT({ sv: claims.sessionVersion, fam: claims.familyId, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(accessKey);
  return { token, expiresAt };
}

export type AccessCheck = { ok: true; claims: AccessClaims } | { ok: false; reason: "expired" | "invalid" };

/** Checks signature, algorithm, issuer, audience, expiry and shape. No database. */
export async function verifyAccessToken(token: string, now = new Date()): Promise<AccessCheck> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: now,
    });
    if (payload.typ !== "access") return { ok: false, reason: "invalid" };
    if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, reason: "invalid" };
    if (!Number.isInteger(payload.sv)) return { ok: false, reason: "invalid" };
    if (typeof payload.fam !== "string" || !payload.fam) return { ok: false, reason: "invalid" };
    return { ok: true, claims: { userId: payload.sub, sessionVersion: payload.sv as number, familyId: payload.fam } };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_JWT_EXPIRED") {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}

function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

async function pairFor(
  claims: AccessClaims,
  refreshToken: string,
  refreshExpiresAt: Date,
  now: Date,
): Promise<TokenPair> {
  const access = await signAccessToken(claims, now);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    tokenType: "Bearer",
  };
}

/** Starts a new sign-in (a new token family) for a user who just proved their password. */
export async function issueTokenPair(
  user: { id: string; sessionVersion: number },
  deviceLabel: string | null,
  now = new Date(),
): Promise<TokenPair> {
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
  const familyId = randomBytes(16).toString("hex");
  await db.mobileRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: digestToken(refreshToken),
      familyId,
      deviceLabel,
      sessionVersion: user.sessionVersion,
      expiresAt,
      lastUsedAt: now,
    },
  });
  return pairFor({ userId: user.id, sessionVersion: user.sessionVersion, familyId }, refreshToken, expiresAt, now);
}

export type RefreshOutcome =
  | { ok: true; tokens: TokenPair; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "reused" | "revoked" };

/** Revokes every still-active token in a family. */
export async function revokeFamily(familyId: string, now = new Date()): Promise<void> {
  await db.mobileRefreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
}

/**
 * Exchanges a refresh token for a new pair, rotating it. A token that was
 * already rotated or revoked is treated as stolen: its whole family is revoked.
 */
export async function rotateRefreshToken(refreshToken: string, now = new Date()): Promise<RefreshOutcome> {
  // 32 random bytes in base64url are always 43 characters.
  if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) return { ok: false, reason: "invalid" };

  const record = await db.mobileRefreshToken.findUnique({
    where: { tokenHash: digestToken(refreshToken) },
    select: {
      id: true,
      userId: true,
      familyId: true,
      deviceLabel: true,
      sessionVersion: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { sessionVersion: true } },
    },
  });
  if (!record) return { ok: false, reason: "invalid" };

  if (record.revokedAt) {
    // Someone is replaying a token that was already used or signed out.
    await revokeFamily(record.familyId, now);
    return { ok: false, reason: "reused" };
  }
  if (record.user.sessionVersion !== record.sessionVersion) {
    // "Sign out everywhere" or a password change happened since this sign-in.
    await revokeFamily(record.familyId, now);
    return { ok: false, reason: "revoked" };
  }
  if (record.expiresAt <= now) {
    await revokeFamily(record.familyId, now);
    return { ok: false, reason: "expired" };
  }

  // The replacement is created before the old token is claimed, so the family
  // always has an active token and requests in flight keep working.
  const nextToken = newRefreshToken();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
  const replacement = await db.mobileRefreshToken.create({
    data: {
      userId: record.userId,
      tokenHash: digestToken(nextToken),
      familyId: record.familyId,
      deviceLabel: record.deviceLabel,
      sessionVersion: record.sessionVersion,
      expiresAt,
      lastUsedAt: now,
    },
    select: { id: true },
  });
  // Claim the old token atomically: of two concurrent refreshes with the same
  // token, only one can win; the loser is a reuse.
  const claimed = await db.mobileRefreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: now, lastUsedAt: now, replacedById: replacement.id },
  });
  if (claimed.count !== 1) {
    await revokeFamily(record.familyId, now);
    return { ok: false, reason: "reused" };
  }

  const tokens = await pairFor(
    { userId: record.userId, sessionVersion: record.sessionVersion, familyId: record.familyId },
    nextToken,
    expiresAt,
    now,
  );
  return { ok: true, tokens, userId: record.userId };
}

/** The family and owner of a refresh token, or null if it is unknown. */
export async function familyOfRefreshToken(refreshToken: string): Promise<{ familyId: string; userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) return null;
  return db.mobileRefreshToken.findUnique({
    where: { tokenHash: digestToken(refreshToken) },
    select: { familyId: true, userId: true },
  });
}

/** "Sign out everywhere": voids every web session and every mobile sign-in. */
export async function signOutEverywhereForUser(userId: string, now = new Date()): Promise<void> {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }),
    db.mobileRefreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
}

/** True while a family still has an active (unrevoked, unexpired) refresh token. */
export async function familyIsActive(userId: string, familyId: string, now = new Date()): Promise<boolean> {
  const active = await db.mobileRefreshToken.findFirst({
    where: { userId, familyId, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  return active !== null;
}
