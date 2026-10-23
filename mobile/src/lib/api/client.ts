import type {
  AbandonReason,
  ActiveSession,
  Assignment,
  AssignmentStatus,
  Course,
  CourseDetail,
  Difficulty,
  NewAssignment,
  Priority,
  SessionSummary,
  Today,
  TokenPair,
  User,
} from "./types";

// A small client for Rushd's /api/v1. Plain TypeScript with no React Native
// imports, so it can be unit tested: storage and fetch are injected.
//
// - Sends the access token as a bearer token.
// - On a 401 it refreshes once and retries once. Concurrent requests share
//   one refresh (two refreshes with the same token would look like token
//   theft to the server and end the sign-in).
// - If the refresh itself is refused, the sign-in is over: tokens are
//   cleared and onSignedOut runs. A network failure never clears tokens.
// - Every failure becomes an ApiError with a code the UI can switch on.

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
  | "internal"
  // Client-side codes:
  | "signed_out"
  | "offline"
  | "timeout"
  | "bad_response";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TokenStore {
  load(): Promise<TokenPair | null>;
  save(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  store: TokenStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Called once when the server ends the sign-in (refresh refused). */
  onSignedOut?: () => void;
}

const SERVER_CODES = new Set<string>([
  "invalid_request",
  "invalid_credentials",
  "unauthorized",
  "token_expired",
  "refresh_token_invalid",
  "refresh_token_reused",
  "not_found",
  "conflict",
  "rate_limited",
  "internal",
]);

/** Turns an HTTP error response into an ApiError, whatever its body looks like. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = response.status >= 500 ? "internal" : "bad_response";
  let message = response.status >= 500 ? "Rushd had a problem. Try again in a moment." : "Something went wrong. Try again.";
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
    if (body?.error && typeof body.error.code === "string" && SERVER_CODES.has(body.error.code)) {
      code = body.error.code as ApiErrorCode;
    }
    if (body?.error && typeof body.error.message === "string" && body.error.message) {
      message = body.error.message;
    }
  } catch {
    // Not JSON (a proxy error page, say): keep the generic message.
  }
  if (response.status === 429 && code === "bad_response") code = "rate_limited";
  return new ApiError(response.status, code, message);
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "offline" || error.code === "timeout");
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 15_000;

  let cached: TokenPair | null | undefined;
  let refreshing: Promise<TokenPair> | null = null;

  async function tokens(): Promise<TokenPair | null> {
    if (cached === undefined) cached = await options.store.load();
    return cached;
  }

  async function saveTokens(next: TokenPair): Promise<void> {
    cached = next;
    await options.store.save(next);
  }

  async function forget(): Promise<void> {
    cached = null;
    await options.store.clear();
  }

  async function send(method: string, path: string, body: unknown, accessToken: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${baseUrl}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError(0, "timeout", "Rushd took too long to answer. Check your connection.");
      void error;
      throw new ApiError(0, "offline", "You're offline. Connect to the internet and try again.");
    } finally {
      clearTimeout(timer);
    }
  }

  async function parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(response.status, "bad_response", "Rushd sent an answer the app couldn't read.");
    }
  }

  /** One refresh at a time, shared by every request that hit a 401. */
  function refresh(): Promise<TokenPair> {
    if (!refreshing) {
      refreshing = (async () => {
        const current = await tokens();
        if (!current) throw new ApiError(401, "signed_out", "Sign in to continue.");
        const response = await send("POST", "/auth/refresh", { refreshToken: current.refreshToken }, null);
        if (!response.ok) {
          const error = await errorFromResponse(response);
          if (response.status === 401) {
            await forget();
            options.onSignedOut?.();
            throw new ApiError(401, "signed_out", "Your sign-in ended. Sign in again.");
          }
          throw error;
        }
        const next = await parse<TokenPair>(response);
        await saveTokens(next);
        return next;
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const current = await tokens();
    if (!current) throw new ApiError(401, "signed_out", "Sign in to continue.");
    let response = await send(method, path, body, current.accessToken);
    if (response.status === 401) {
      // If another request already refreshed, retry with its token first.
      const latest = cached && cached.accessToken !== current.accessToken ? cached : await refresh();
      response = await send(method, path, body, latest.accessToken);
      if (response.status === 401) {
        await forget();
        options.onSignedOut?.();
        throw new ApiError(401, "signed_out", "Your sign-in ended. Sign in again.");
      }
    }
    if (!response.ok) throw await errorFromResponse(response);
    return parse<T>(response);
  }

  return {
    baseUrl,

    async isSignedIn(): Promise<boolean> {
      return (await tokens()) !== null;
    },

    async signIn(email: string, password: string, deviceName?: string): Promise<{ onboardingCompleted: boolean }> {
      const response = await send("POST", "/auth/token", { email, password, deviceName }, null);
      if (!response.ok) throw await errorFromResponse(response);
      const body = await parse<TokenPair & { onboardingCompleted: boolean }>(response);
      const { onboardingCompleted, ...pair } = body;
      await saveTokens(pair);
      return { onboardingCompleted };
    },

    /** Ends this device's sign-in. Local tokens are cleared even if the server can't be reached. */
    async signOut(): Promise<void> {
      const current = await tokens();
      try {
        if (current) await send("POST", "/auth/logout", { refreshToken: current.refreshToken }, null);
      } catch {
        // Offline: the server-side token expires on its own; the device forgets it now.
      } finally {
        await forget();
      }
    },

    /** Ends every sign-in on every device and the web. Needs the server; fails offline. */
    async signOutEverywhere(): Promise<void> {
      await request<void>("POST", "/auth/logout", { everywhere: true });
      await forget();
    },

    me: () => request<{ user: User }>("GET", "/me").then((body) => body.user),
    today: () => request<{ today: Today }>("GET", "/today").then((body) => body.today),
    assignments: (status: "open" | "completed" | "all" = "open") =>
      request<{ assignments: Assignment[] }>("GET", `/assignments?status=${status}`).then((body) => body.assignments),
    createAssignment: (input: NewAssignment) =>
      request<{ assignment: Assignment }>("POST", "/assignments", input).then((body) => body.assignment),
    setAssignmentStatus: (id: string, status: AssignmentStatus) =>
      request<{ assignment: Assignment }>("PATCH", `/assignments/${encodeURIComponent(id)}`, { status }).then((body) => body.assignment),
    updateAssignment: (
      id: string,
      changes: Partial<{ courseId: string; title: string; dueAt: string; estimatedMinutes: number; priority: Priority; notes: string | null; status: AssignmentStatus }>,
    ) => request<{ assignment: Assignment }>("PATCH", `/assignments/${encodeURIComponent(id)}`, changes).then((body) => body.assignment),
    courses: () => request<{ courses: Course[] }>("GET", "/courses").then((body) => body.courses),
    course: (id: string) => request<CourseDetail>("GET", `/courses/${encodeURIComponent(id)}`),
    activeSession: () => request<{ session: ActiveSession | null }>("GET", "/sessions/active").then((body) => body.session),
    startSession: (target: { assignmentId: string } | { examId: string }, source: "PLANNED" | "MANUAL" = "MANUAL") =>
      request<{ session: ActiveSession }>("POST", "/sessions", { ...target, source }).then((body) => body.session),
    completeSession: (id: string, actualMinutes: number, difficulty?: Difficulty) =>
      request<{ summary: SessionSummary }>("POST", `/sessions/${encodeURIComponent(id)}/complete`, { actualMinutes, difficulty }).then(
        (body) => body.summary,
      ),
    abandonSession: (id: string, reason?: AbandonReason) =>
      request<{ ok: true }>("POST", `/sessions/${encodeURIComponent(id)}/abandon`, { reason }).then(() => undefined),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
