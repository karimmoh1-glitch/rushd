import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const SESSION_COOKIE = "rushd_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const encodedKey = new TextEncoder().encode(env.SESSION_SECRET);

export interface SessionPayload extends JWTPayload {
  userId: string;
}

async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(encodedKey);
}

async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, encodedKey, {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<void> {
  const token = await encrypt({ userId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function readSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decrypt(token);
}

export async function readSessionFromToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  return decrypt(token);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
