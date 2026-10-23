import "server-only";
import type * as z from "zod";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { clientIpFromHeaders } from "@/server/actions/client-ip";
import { verifyAccessToken } from "@/lib/api/v1/tokens";

// Plumbing shared by every /api/v1 route: one error shape, CORS for
// development, client IP, rate limits, bearer authentication, and body
// validation. Bearer tokens only, never cookies, so CSRF doesn't apply.

export type ApiErrorCode =
  | "invalid_request"
  | "invalid_credentials"
  | "unauthorized"
  | "token_expired"
  | "refresh_token_invalid"
  | "refresh_token_reused"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

/** Thrown inside a handler to answer with { error: { code, message } }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const badRequest = (message: string) => new ApiError(400, "invalid_request", message);

/** Origins allowed to call the API from a browser. Native apps send no Origin
 * header, so they never need this. In development any localhost or private
 * LAN origin is allowed (Expo's web preview); in production only the origins
 * listed in API_CORS_ORIGINS (comma-separated), which is unset by default. */
function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const listed = (process.env.API_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (listed.includes(origin)) return origin;
  if (process.env.NODE_ENV !== "production") {
    try {
      const { hostname, protocol } = new URL(origin);
      const local =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        /^192\.168\.\d+\.\d+$/.test(hostname) ||
        /^10\.\d+\.\d+\.\d+$/.test(hostname);
      if (local && (protocol === "http:" || protocol === "https:")) return origin;
    } catch {
      return null;
    }
  }
  return null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request.headers.get("origin"));
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** The answer to a CORS preflight. Every route exports it as OPTIONS. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function json(request: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...corsHeaders(request), ...extra },
  });
}

export function noContent(request: Request): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...corsHeaders(request) } });
}

export function errorResponse(request: Request, error: ApiError): Response {
  return json(request, { error: { code: error.code, message: error.message } }, error.status, error.headers);
}

/** The caller's IP for rate limiting, with the web's trusted-header rules (src/server/actions/client-ip.ts). */
export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

export async function enforceRateLimit(key: string, max: number, windowMs = 15 * 60 * 1000): Promise<void> {
  const result = await checkRateLimit(key, { max, windowMs });
  if (!result.allowed) {
    throw new ApiError(429, "rate_limited", "Too many requests. Try again in a few minutes.", {
      "Retry-After": String(result.retryAfterSeconds ?? 60),
    });
  }
}

/** Parses a JSON body against a schema; a bad body is a 400 with the first issue. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("The request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw badRequest(`${where}${issue?.message ?? "Invalid input."}`);
  }
  return parsed.data;
}

export interface ApiUser {
  id: string;
  email: string;
  isAdmin: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  familyId: string;
  profile: { displayName: string; timezone: string } | null;
}

/** Requests per 15 minutes: per IP before authentication, per signed-in user after. */
export const IP_LIMIT = 900;
export const USER_LIMIT = 600;

/**
 * The signed-in user behind "Authorization: Bearer <access token>", or a 401.
 * The token's signature is checked first; then the database confirms the
 * user still exists, their session version hasn't been bumped ("sign out
 * everywhere", password change), and the sign-in it came from wasn't revoked.
 */
export async function authenticate(request: Request): Promise<ApiUser> {
  await enforceRateLimit(`api-ip:${clientIp(request)}`, IP_LIMIT);

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw new ApiError(401, "unauthorized", "Sign in to continue.");

  const check = await verifyAccessToken(match[1]);
  if (!check.ok) {
    if (check.reason === "expired") throw new ApiError(401, "token_expired", "Your session expired. Refresh it to continue.");
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  }
  const { userId, sessionVersion, familyId } = check.claims;

  const [user, activeToken] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        onboardingCompletedAt: true,
        createdAt: true,
        sessionVersion: true,
        profile: { select: { displayName: true, timezone: true } },
      },
    }),
    db.mobileRefreshToken.findFirst({
      where: { userId, familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);
  if (!user || user.sessionVersion !== sessionVersion || !activeToken) {
    throw new ApiError(401, "unauthorized", "You were signed out. Sign in again.");
  }

  await enforceRateLimit(`api-user:${user.id}`, USER_LIMIT);
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    onboardingCompletedAt: user.onboardingCompletedAt,
    createdAt: user.createdAt,
    familyId,
    profile: user.profile,
  };
}

/** Runs a handler and turns thrown ApiErrors (and anything unexpected) into the error shape. */
export async function handle(request: Request, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(request, error);
    // Names only in production: messages can carry user data.
    if (process.env.NODE_ENV === "production") {
      console.error("[api/v1] unhandled error", error instanceof Error ? error.name : "unknown");
    } else {
      console.error("[api/v1] unhandled error", error);
    }
    return errorResponse(request, new ApiError(500, "internal", "Something went wrong. Try again."));
  }
}

/** Authenticates, then runs the handler with the signed-in user. */
export function withUser(request: Request, run: (user: ApiUser) => Promise<Response>): Promise<Response> {
  return handle(request, async () => run(await authenticate(request)));
}
