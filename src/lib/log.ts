// A small structured logger: one JSON object per line, with a level, an event
// name, and a few fields. Vercel (and any log drain) can filter these lines.
//
// Privacy rules, enforced here so call sites can't forget them:
// - Fields whose names look like content or secrets (message, draft, text,
//   body, content, prompt, image, photo, token, password, secret, cookie,
//   authorization, email, ...) are replaced with "[redacted]".
// - Long strings are cut to 200 characters; nested objects stop at depth 3.
// - Errors are reduced to their name (and a short code when there is one).
//   Error messages are never logged: Prisma and fetch errors can embed query
//   arguments, URLs with tokens, or student text.
//
// Usage: log.info("cron.daily.done", { requestId, synced: 3 })
//        log.error("tutor.turn_failed", { requestId, err: error })

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Any word of a field name (camelCase, snake_case or kebab-case) in this set
// marks it as sensitive: "draftText", "access_token", "email" are redacted,
// "context" and "messageCount" (a number) are not.
const SENSITIVE_WORDS = new Set([
  "password", "passwd", "pass", "secret", "token", "authorization", "auth", "cookie", "apikey", "key",
  "signature", "email", "message", "draft", "text", "body", "content", "prompt", "image", "images",
  "photo", "photos", "base64", "answer", "note", "notes", "instructions", "verifier", "ciphertext",
]);

function isSensitiveKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((word) => SENSITIVE_WORDS.has(word)) || /api[-_]?key/i.test(key);
}

const MAX_STRING = 200;
const MAX_DEPTH = 3;
const MAX_KEYS = 30;

/** An error reduced to what is safe to log: its class name and a short code. */
export function describeError(error: unknown): { name: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const out: { name: string; code?: string } = { name: error.name || "Error" };
    if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(code)) {
      out.code = code;
    }
    return out;
  }
  return { name: typeof error };
}

function clean(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return describeError(value);
  if (value instanceof Date) return value.toISOString();
  switch (typeof value) {
    case "string":
      return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "object":
      break;
    default:
      return typeof value;
  }
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((item) => clean(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (count++ >= MAX_KEYS) {
      out["…"] = "[truncated]";
      break;
    }
    // Counts and flags are safe under any name; strings and objects are not.
    const harmless = typeof inner === "number" || typeof inner === "boolean" || inner === null || inner === undefined;
    out[key] = isSensitiveKey(key) && !harmless ? "[redacted]" : clean(inner, depth + 1);
  }
  return out;
}

/** Builds the JSON line without writing it (exported for tests). */
export function formatLogLine(level: LogLevel, event: string, fields: Record<string, unknown> = {}, now = new Date()): string {
  const { err, ...rest } = fields;
  const line: Record<string, unknown> = {
    ts: now.toISOString(),
    level,
    event: clean(event, MAX_DEPTH),
    ...(clean(rest, 0) as Record<string, unknown>),
  };
  if (err !== undefined) line.err = describeError(err);
  return JSON.stringify(line);
}

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase() as LogLevel;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function write(level: LogLevel, event: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < minLevel()) return;
  // Tests stay quiet unless they opt in.
  if (process.env.VITEST && !process.env.LOG_IN_TESTS) return;
  const line = formatLogLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
