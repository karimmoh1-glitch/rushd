import "server-only";

// In-memory fixed-window rate limiter for auth endpoints.
//
// Limitation (documented, not a bug): this state lives in the Node process,
// so it resets on redeploy and isn't shared across multiple instances. That's
// an acceptable tradeoff for a single-instance MVP deployment — see
// docs/ARCHITECTURE.md. Revisit with a shared store (e.g. the Postgres DB
// itself, or Redis) before scaling beyond one instance.
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

export function checkRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}
