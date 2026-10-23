import { describe, it, expect, vi } from "vitest";
import { ApiError, createApiClient, errorFromResponse, isOfflineError, type TokenStore } from "./client";
import type { TokenPair } from "./types";

function pair(n: number): TokenPair {
  return {
    accessToken: `access-${n}`,
    accessTokenExpiresAt: "2026-10-23T00:15:00.000Z",
    refreshToken: `refresh-${n}`,
    refreshTokenExpiresAt: "2026-12-22T00:00:00.000Z",
    tokenType: "Bearer",
  };
}

function memoryStore(initial: TokenPair | null = null) {
  let value = initial;
  const store: TokenStore & { value: () => TokenPair | null } = {
    load: vi.fn(async () => value),
    save: vi.fn(async (next: TokenPair) => {
      value = next;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
    value: () => value,
  };
  return store;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function fakeServer(handler: Handler) {
  const calls: { url: string; method: string; auth: string | null; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: init.method ?? "GET",
      auth: headers.Authorization ?? null,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return handler(url, init);
  });
  return { fetch: fetchImpl as unknown as typeof fetch, calls };
}

const today = { today: { date: "2026-10-22" } };

describe("api client", () => {
  it("signs in, stores the pair, and sends the access token as a bearer token", async () => {
    const store = memoryStore();
    const server = fakeServer((url) => {
      if (url.endsWith("/auth/token")) return json(200, { ...pair(1), onboardingCompleted: true });
      return json(200, today);
    });
    const api = createApiClient({ baseUrl: "http://host:3104/", store, fetch: server.fetch });

    expect(await api.signIn("a@b.co", "pw", "iPhone")).toEqual({ onboardingCompleted: true });
    expect(store.value()).toEqual(pair(1));
    expect(server.calls[0]).toMatchObject({ url: "http://host:3104/api/v1/auth/token", method: "POST", auth: null });
    expect(server.calls[0].body).toEqual({ email: "a@b.co", password: "pw", deviceName: "iPhone" });

    await api.today();
    expect(server.calls[1]).toMatchObject({ url: "http://host:3104/api/v1/today", auth: "Bearer access-1" });
  });

  it("refreshes once on a 401 and retries with the new token", async () => {
    const store = memoryStore(pair(1));
    const server = fakeServer((url, init) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (url.endsWith("/auth/refresh")) return json(200, pair(2));
      if (auth === "Bearer access-1") return json(401, { error: { code: "token_expired", message: "Expired" } });
      return json(200, today);
    });
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });

    await expect(api.today()).resolves.toEqual(today.today);
    expect(server.calls.map((call) => call.url.replace("http://host/api/v1", ""))).toEqual(["/today", "/auth/refresh", "/today"]);
    expect(server.calls[1].body).toEqual({ refreshToken: "refresh-1" });
    expect(server.calls[2].auth).toBe("Bearer access-2");
    expect(store.value()).toEqual(pair(2));
  });

  it("shares one refresh between concurrent requests", async () => {
    const store = memoryStore(pair(1));
    let refreshes = 0;
    const server = fakeServer(async (url, init) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (url.endsWith("/auth/refresh")) {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(200, pair(2));
      }
      if (auth === "Bearer access-1") return json(401, { error: { code: "token_expired", message: "Expired" } });
      return json(200, url.endsWith("/me") ? { user: { id: "u" } } : today);
    });
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });

    await Promise.all([api.today(), api.me(), api.today()]);
    expect(refreshes).toBe(1);
  });

  it("clears tokens and reports sign-out when the refresh is refused (reuse or revoked)", async () => {
    const store = memoryStore(pair(1));
    const onSignedOut = vi.fn();
    const server = fakeServer((url) => {
      if (url.endsWith("/auth/refresh")) return json(401, { error: { code: "refresh_token_reused", message: "Ended" } });
      return json(401, { error: { code: "unauthorized", message: "Sign in" } });
    });
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch, onSignedOut });

    const error = await api.today().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "signed_out" });
    expect(store.value()).toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(await api.isSignedIn()).toBe(false);
  });

  it("keeps tokens when the network fails during a refresh", async () => {
    const store = memoryStore(pair(1));
    const server = fakeServer((url) => {
      if (url.endsWith("/auth/refresh")) throw new TypeError("Network request failed");
      return json(401, { error: { code: "token_expired", message: "Expired" } });
    });
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });

    const error = await api.today().catch((caught) => caught);
    expect(error).toMatchObject({ code: "offline" });
    expect(isOfflineError(error)).toBe(true);
    expect(store.value()).toEqual(pair(1));
  });

  it("maps server errors to their code and message", async () => {
    const store = memoryStore(pair(1));
    const server = fakeServer(() => json(404, { error: { code: "not_found", message: "Assignment not found." } }));
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });
    await expect(api.setAssignmentStatus("x", "COMPLETED")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      message: "Assignment not found.",
    });
    expect(server.calls[0]).toMatchObject({ method: "PATCH", url: "http://host/api/v1/assignments/x", body: { status: "COMPLETED" } });
  });

  it("gives a wrong password the server's generic message without touching stored tokens", async () => {
    const store = memoryStore();
    const server = fakeServer(() => json(401, { error: { code: "invalid_credentials", message: "Invalid email or password." } }));
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });
    await expect(api.signIn("a@b.co", "nope")).rejects.toMatchObject({ code: "invalid_credentials", message: "Invalid email or password." });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("handles non-JSON and server errors with generic messages", async () => {
    expect(await errorFromResponse(new Response("<html>Bad gateway</html>", { status: 502 }))).toMatchObject({
      status: 502,
      code: "internal",
      message: "Rushd had a problem. Try again in a moment.",
    });
    expect(await errorFromResponse(new Response("slow down", { status: 429 }))).toMatchObject({ code: "rate_limited" });
    expect(await errorFromResponse(json(400, { error: { code: "made_up", message: "Title is required" } }))).toMatchObject({
      code: "bad_response",
      message: "Title is required",
    });
  });

  it("reports a request that never answers as a timeout", async () => {
    const store = memoryStore(pair(1));
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: "http://host", store, fetch: fetchImpl, timeoutMs: 20 });
    await expect(api.today()).rejects.toMatchObject({ code: "timeout" });
  });

  it("refuses requests before sign-in without calling the server", async () => {
    const server = fakeServer(() => json(200, today));
    const api = createApiClient({ baseUrl: "http://host", store: memoryStore(), fetch: server.fetch });
    await expect(api.today()).rejects.toMatchObject({ code: "signed_out" });
    expect(server.calls).toHaveLength(0);
  });

  it("signs out locally even when the server can't be reached", async () => {
    const store = memoryStore(pair(1));
    const server = fakeServer(() => {
      throw new TypeError("Network request failed");
    });
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });
    await api.signOut();
    expect(store.value()).toBeNull();
    expect(server.calls[0].body).toEqual({ refreshToken: "refresh-1" });
  });

  it("signs out everywhere through the server, then forgets the tokens", async () => {
    const store = memoryStore(pair(1));
    const server = fakeServer(() => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: "http://host", store, fetch: server.fetch });
    await api.signOutEverywhere();
    expect(server.calls[0]).toMatchObject({ method: "POST", auth: "Bearer access-1", body: { everywhere: true } });
    expect(store.value()).toBeNull();
  });
});
