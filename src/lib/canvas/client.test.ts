import { describe, it, expect } from "vitest";
import { CanvasClient, CanvasApiError, parseNextLink } from "./client";

const BASE = "https://school.instructure.com";
const TOKEN = "7~SuperSecretCanvasToken0123456789";

interface Call {
  url: string;
  init: { headers: Record<string, string>; redirect?: string };
}

type Responder = (url: string) => { status: number; body?: unknown; headers?: Record<string, string> };

function fakeClient(responder: Responder, calls: Call[] = []) {
  const fetchImpl = (async (url: string, init: Call["init"]) => {
    calls.push({ url, init });
    const r = responder(url);
    const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? null);
    return new Response(body, { status: r.status, headers: r.headers });
  }) as never;
  return new CanvasClient(BASE, TOKEN, { resolvedAddresses: ["93.184.216.34"], fetchImpl });
}

async function errorOf(p: Promise<unknown>): Promise<CanvasApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CanvasApiError) return e;
    throw e;
  }
  throw new Error("expected a CanvasApiError");
}

describe("CanvasClient — request hygiene", () => {
  it("sends the token only as a Bearer header, never in the URL, and never follows redirects", async () => {
    const calls: Call[] = [];
    const client = fakeClient(() => ({ status: 200, body: { id: 1, name: "Sam Student" } }), calls);
    const me = await client.getSelf();
    expect(me.name).toBe("Sam Student");
    expect(calls[0].url).toBe(`${BASE}/api/v1/users/self`);
    expect(calls[0].url).not.toContain(TOKEN);
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].init.redirect).toBe("manual");
  });

  it("strips Canvas's while(1); JSON prefix", async () => {
    const client = fakeClient(() => ({ status: 200, body: 'while(1);{"id":2,"name":"A"}' }));
    expect((await client.getSelf()).id).toBe(2);
  });
});

describe("CanvasClient — pagination", () => {
  it("follows Link rel=next across pages", async () => {
    const client = fakeClient((url) => {
      if (url.includes("page=2")) return { status: 200, body: [{ id: 2, name: "Bio" }] };
      return {
        status: 200,
        body: [{ id: 1, name: "Chem" }],
        headers: { link: `<${BASE}/api/v1/courses?page=2&per_page=100>; rel="next", <${BASE}/api/v1/courses?page=1>; rel="first"` },
      };
    });
    const courses = await client.listCourses();
    expect(courses.map((c) => c.name)).toEqual(["Chem", "Bio"]);
  });

  it("refuses a pagination link that leaves the connected Canvas origin (token exfiltration guard)", async () => {
    const calls: Call[] = [];
    const client = fakeClient(
      () => ({
        status: 200,
        body: [{ id: 1, name: "Chem" }],
        headers: { link: `<https://attacker.example/steal?page=2>; rel="next"` },
      }),
      calls,
    );
    const err = await errorOf(client.listCourses());
    expect(err.code).toBe("UNSAFE_URL");
    expect(calls.every((c) => c.url.startsWith(BASE))).toBe(true);
  });

  it("requests the student's own submission with each assignment", async () => {
    const calls: Call[] = [];
    const client = fakeClient(() => ({ status: 200, body: [] }), calls);
    await client.listAssignments(42);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api/v1/courses/42/assignments");
    expect(url.searchParams.getAll("include[]")).toContain("submission");
    expect(url.searchParams.get("per_page")).toBe("100");
  });

  it("drops courses Canvas hides by date and malformed entries", async () => {
    const client = fakeClient(() => ({
      status: 200,
      body: [{ id: 1, name: "Visible" }, { id: 2, access_restricted_by_date: true, name: "Hidden" }, { nope: true }],
    }));
    expect((await client.listCourses()).map((c) => c.id)).toEqual([1]);
  });
});

describe("CanvasClient — error mapping (never leaks the token)", () => {
  it.each([
    [401, {}, "UNAUTHORIZED"],
    [403, {}, "FORBIDDEN"],
    [403, { "x-rate-limit-remaining": "0" }, "RATE_LIMITED"],
    [404, {}, "NOT_FOUND"],
    [429, {}, "RATE_LIMITED"],
    [502, {}, "SERVER_ERROR"],
    [302, { location: "http://10.0.0.1/" }, "NOT_FOUND"],
  ])("HTTP %i -> %s", async (status, headers, code) => {
    const client = fakeClient(() => ({ status, body: { errors: [{ message: "x" }] }, headers }));
    const err = await errorOf(client.getSelf());
    expect(err.code).toBe(code);
    expect(err.message).not.toContain(TOKEN);
    expect(String(err.stack)).not.toContain(TOKEN);
  });

  it("treats an HTML login page as 'not Canvas'", async () => {
    const client = fakeClient(() => ({ status: 200, body: "<html><body>Sign in</body></html>" }));
    expect((await errorOf(client.getSelf())).code).toBe("BAD_RESPONSE");
  });

  it("maps network failures and timeouts", async () => {
    const boom = (msg: string) =>
      new CanvasClient(BASE, TOKEN, {
        resolvedAddresses: ["93.184.216.34"],
        fetchImpl: (async () => {
          throw new TypeError("fetch failed", { cause: new Error(msg) });
        }) as never,
      });
    expect((await errorOf(boom("UND_ERR_CONNECT_TIMEOUT").getSelf())).code).toBe("TIMEOUT");
    expect((await errorOf(boom("ECONNREFUSED").getSelf())).code).toBe("NETWORK");
  });
});

describe("parseNextLink", () => {
  it("finds rel=next among several relations", () => {
    expect(parseNextLink(`<a>; rel="current", <b>; rel="next", <c>; rel="last"`)).toBe("b");
    expect(parseNextLink(`<a>; rel="current"`)).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});
