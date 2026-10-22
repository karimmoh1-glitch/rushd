import { describe, it, expect, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";

// A minimal stand-in for Next's request-scoped cookie store.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/auth/session");
const { getCurrentUser } = await import("@/lib/auth/dal");
const { checkRateLimit, rateLimitKey } = await import("@/lib/auth/rate-limit");
const { issueResetToken, redeemResetToken, RESET_TOKEN_TTL_MS } = await import("@/lib/auth/password-reset");
const { verifyPassword } = await import("@/lib/auth/password");

describe("session revocation (integration)", { timeout: 60_000 }, () => {
  const userIds: string[] = [];
  afterEach(async () => {
    jar.clear();
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  it("accepts a session issued under the current version", async () => {
    const user = await createTestUser({ displayName: "Current" });
    userIds.push(user.id);
    await createSession(user.id, 0);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("rejects every older session once the version is bumped", async () => {
    const user = await createTestUser({ displayName: "Revoked" });
    userIds.push(user.id);
    await createSession(user.id, 0);
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    expect(await getCurrentUser()).toBeNull();

    await createSession(user.id, 1);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("treats tokens issued before versioning as version 0", async () => {
    const user = await createTestUser({ displayName: "Legacy" });
    userIds.push(user.id);
    const legacy = await new SignJWT({ userId: user.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    jar.set(SESSION_COOKIE_NAME, legacy);
    expect((await getCurrentUser())?.id).toBe(user.id);

    await db.user.update({ where: { id: user.id }, data: { sessionVersion: 1 } });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("shared rate limiter (integration)", { timeout: 60_000 }, () => {
  const keys: string[] = [];
  afterEach(async () => {
    await db.rateLimitBucket.deleteMany({ where: { key: { in: keys.splice(0).map(rateLimitKey) } } });
  });

  it("allows up to the limit, then blocks with a retry time", async () => {
    const key = `test:${crypto.randomUUID()}`;
    keys.push(key);
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(key, { max: 3 })).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, { max: 3 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("starts a fresh window after the old one expires", async () => {
    const key = `test:${crypto.randomUUID()}`;
    keys.push(key);
    expect((await checkRateLimit(key, { max: 1, windowMs: 1000 })).allowed).toBe(true);
    expect((await checkRateLimit(key, { max: 1, windowMs: 1000 })).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1200));
    expect((await checkRateLimit(key, { max: 1, windowMs: 1000 })).allowed).toBe(true);
  });

  it("stores only a hash of the key", async () => {
    const key = `login:203.0.113.9:someone@example.com:${crypto.randomUUID()}`;
    keys.push(key);
    await checkRateLimit(key);
    const raw = await db.rateLimitBucket.findUnique({ where: { key } });
    expect(raw).toBeNull();
    expect(await db.rateLimitBucket.findUnique({ where: { key: rateLimitKey(key) } })).not.toBeNull();
  });

  it("counts concurrent attempts exactly", async () => {
    const key = `test:${crypto.randomUUID()}`;
    keys.push(key);
    const results = await Promise.all(Array.from({ length: 8 }, () => checkRateLimit(key, { max: 5 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe("password reset tokens (integration)", { timeout: 60_000 }, () => {
  const userIds: string[] = [];
  afterEach(async () => {
    jar.clear();
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  it("sets the password once, stores only a digest, and signs out old sessions", async () => {
    const user = await createTestUser({ displayName: "Reset" });
    userIds.push(user.id);
    await createSession(user.id, 0);
    const token = await issueResetToken(user.id);

    const stored = await db.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    expect(await redeemResetToken(token, "brand new pass 1")).toEqual({ ok: true, userId: user.id });
    const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    expect(await verifyPassword("brand new pass 1", row!.passwordHash)).toBe(true);
    expect(await getCurrentUser()).toBeNull();

    expect(await redeemResetToken(token, "another pass 2")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects expired, unknown, malformed and superseded tokens", async () => {
    const user = await createTestUser({ displayName: "Expired" });
    userIds.push(user.id);
    const old = await issueResetToken(user.id, new Date(Date.now() - RESET_TOKEN_TTL_MS - 1000));
    expect(await redeemResetToken(old, "brand new pass 1")).toEqual({ ok: false, reason: "expired" });

    const first = await issueResetToken(user.id);
    await issueResetToken(user.id);
    expect(await redeemResetToken(first, "brand new pass 1")).toEqual({ ok: false, reason: "invalid" });

    expect(await redeemResetToken("A".repeat(43), "brand new pass 1")).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemResetToken("short", "brand new pass 1")).toEqual({ ok: false, reason: "invalid" });
  });

  it("lets only one of two concurrent redemptions win", async () => {
    const user = await createTestUser({ displayName: "Race" });
    userIds.push(user.id);
    const token = await issueResetToken(user.id);
    const results = await Promise.all([
      redeemResetToken(token, "first pass 1"),
      redeemResetToken(token, "second pass 2"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
