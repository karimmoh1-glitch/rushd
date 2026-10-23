import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const SESSION_COOKIE_NAME = "rushd_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const signingKey = new TextEncoder().encode(env.SESSION_SECRET);

export interface SessionPayload extends JWTPayload {
  userId: string;
  /** User.sessionVersion at issue time; tokens from before a bump are void.
   * Absent on tokens issued before versioning existed (treated as 0). */
  sv?: number;
}

/** A signed (not encrypted) JWT: its payload is readable, but it can't be changed without the secret. */
async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(signingKey);
}

/** The payload if the signature, algorithm, expiry and shape are all valid; otherwise null. */
async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, signingKey, {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    if (payload.sv !== undefined && !Number.isInteger(payload.sv)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, sessionVersion = 0): Promise<void> {
  const token = await signToken({ userId, sv: sessionVersion });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function readSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
