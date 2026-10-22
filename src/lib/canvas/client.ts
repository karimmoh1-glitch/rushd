import "server-only";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { resolvePublicAddresses, CanvasUrlError } from "./base-url";
import type { CanvasAnnouncement, CanvasModule, CanvasModuleItem, CanvasPage } from "./content";

// Minimal Canvas LMS REST client, scoped to what the sync needs. Endpoints
// and parameters follow the official docs:
//   https://developerdocs.instructure.com/services/canvas
//
// Design constraints (all security-relevant):
//  * The hostname is resolved and every address vetted (base-url.ts) and the
//    socket is then pinned to those addresses — the request cannot be
//    rerouted by a DNS change between check and connect.
//  * Redirects are never followed (a redirect to a private host would skip
//    the vetting). Canvas APIs don't redirect on success.
//  * Hard timeouts on connect/headers/body; bounded response size.
//  * The token only ever appears in the Authorization header. It is never
//    put in a URL, never logged, never included in a thrown error.

export type CanvasErrorCode =
  | "UNAUTHORIZED" // token invalid/expired/revoked
  | "FORBIDDEN" // token lacks permission for this resource
  | "NOT_FOUND" // not a Canvas instance, or the endpoint doesn't exist
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "BAD_RESPONSE"
  | "SERVER_ERROR"
  | "UNSAFE_URL";

export class CanvasApiError extends Error {
  constructor(
    public readonly code: CanvasErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CanvasApiError";
  }
}

export interface CanvasUser {
  id: number;
  name: string;
  short_name?: string;
  primary_email?: string;
  login_id?: string;
}

export interface CanvasTerm {
  id: number;
  name: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  workflow_state?: "unpublished" | "available" | "completed" | "deleted";
  term?: CanvasTerm;
  enrollment_term_id?: number;
  access_restricted_by_date?: boolean;
  start_at?: string | null;
  end_at?: string | null;
}

export interface CanvasSubmission {
  workflow_state?: "submitted" | "unsubmitted" | "graded" | "pending_review";
  submitted_at?: string | null;
  missing?: boolean;
  late?: boolean;
  excused?: boolean;
  // Canvas also returns score/grade on this object; Rushd deliberately
  // doesn't type, read, or store them.
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at: string | null;
  lock_at?: string | null;
  unlock_at?: string | null;
  points_possible?: number | null;
  html_url?: string;
  published?: boolean;
  workflow_state?: string;
  submission_types?: string[];
  has_submitted_submissions?: boolean;
  submission?: CanvasSubmission;
  only_visible_to_overrides?: boolean;
  // Present when the assignment has an associated rubric; validated by
  // parseRubric in content.ts before anything stores it.
  rubric?: unknown;
}

const CONNECT_TIMEOUT_MS = 8_000;
const HEADERS_TIMEOUT_MS = 15_000;
const BODY_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 50; // 50 × per_page=100 = 5,000 records — far beyond any student
const PER_PAGE = 100;
const USER_AGENT = "Rushd/1.0 (+https://therushd.com)";

interface ClientOptions {
  /** Test seam: pre-resolved addresses skip DNS (and the vetting that goes
   * with it) — production never passes this. */
  resolvedAddresses?: string[];
  fetchImpl?: typeof undiciFetch;
}

export class CanvasClient {
  private dispatcher: Dispatcher | null = null;
  private addresses: string[] | null;
  private readonly fetchImpl: typeof undiciFetch;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    options: ClientOptions = {},
  ) {
    this.addresses = options.resolvedAddresses ?? null;
    this.fetchImpl = options.fetchImpl ?? undiciFetch;
  }

  private async getDispatcher(): Promise<Dispatcher> {
    if (this.dispatcher) return this.dispatcher;
    const addresses = this.addresses ?? (await resolvePublicAddresses(this.baseUrl));
    this.addresses = addresses;
    // Pin DNS: connect only to the vetted addresses, round-robin on retry.
    let i = 0;
    this.dispatcher = new Agent({
      connect: {
        timeout: CONNECT_TIMEOUT_MS,
        // Node calls lookup either expecting a single address or, with
        // `all: true` (happy-eyeballs), an array — honor both shapes.
        lookup: ((
          _hostname: string,
          opts: { all?: boolean },
          cb: (err: Error | null, address: unknown, family?: number) => void,
        ) => {
          const address = addresses[i++ % addresses.length];
          const family = address.includes(":") ? 6 : 4;
          if (opts?.all) cb(null, [{ address, family }]);
          else cb(null, address, family);
        }) as never,
      },
      headersTimeout: HEADERS_TIMEOUT_MS,
      bodyTimeout: BODY_TIMEOUT_MS,
      // No redirect interceptor is installed and requests use
      // redirect: "manual", so a 3xx is surfaced (and rejected), never followed.
    });
    return this.dispatcher;
  }

  async close(): Promise<void> {
    await this.dispatcher?.close();
    this.dispatcher = null;
  }

  private async request<T>(path: string, params: Record<string, string | string[]> = {}): Promise<{ data: T; next: string | null }> {
    const url = new URL(`/api/v1${path}`, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, item);
      else url.searchParams.set(k, v);
    }
    return this.requestUrl<T>(url.toString());
  }

  private async requestUrl<T>(absoluteUrl: string): Promise<{ data: T; next: string | null }> {
    // Pagination "next" links come from Canvas itself; refuse any that leave
    // the vetted origin.
    if (!absoluteUrl.startsWith(`${this.baseUrl}/`)) {
      throw new CanvasApiError("UNSAFE_URL", "Canvas returned a link to a different site.");
    }

    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await this.fetchImpl(absoluteUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        dispatcher: await this.getDispatcher(),
      });
    } catch (error) {
      if (error instanceof CanvasUrlError) {
        throw new CanvasApiError("UNSAFE_URL", error.message);
      }
      const msg = String((error as Error)?.cause ?? error);
      const code: CanvasErrorCode = /timeout|timed out|ETIMEDOUT|UND_ERR_(CONNECT|HEADERS|BODY)_TIMEOUT/i.test(msg)
        ? "TIMEOUT"
        : "NETWORK";
      throw new CanvasApiError(
        code,
        code === "TIMEOUT"
          ? "Canvas took too long to respond. Try again in a moment."
          : "Couldn't reach Canvas. Check the address and your connection.",
      );
    }

    if (res.status >= 300 && res.status < 400) {
      throw new CanvasApiError(
        "NOT_FOUND",
        "That address redirected somewhere else. Use your school's exact Canvas address.",
        res.status,
      );
    }
    if (res.status === 401) {
      throw new CanvasApiError("UNAUTHORIZED", "Canvas rejected this token. It may be expired or revoked.", 401);
    }
    if (res.status === 403) {
      // Canvas also uses 403 for rate limiting with a specific header/body.
      const rl = res.headers.get("x-rate-limit-remaining");
      if (rl !== null && Number(rl) <= 0) {
        throw new CanvasApiError("RATE_LIMITED", "Canvas is rate-limiting requests. Try again shortly.", 403);
      }
      throw new CanvasApiError("FORBIDDEN", "This token doesn't have permission to read that.", 403);
    }
    if (res.status === 404) {
      throw new CanvasApiError("NOT_FOUND", "No Canvas API found at that address.", 404);
    }
    if (res.status === 429) {
      throw new CanvasApiError("RATE_LIMITED", "Canvas is rate-limiting requests. Try again shortly.", 429);
    }
    if (res.status >= 500) {
      throw new CanvasApiError("SERVER_ERROR", "Canvas is having trouble right now. Try again later.", res.status);
    }
    if (!res.ok) {
      throw new CanvasApiError("BAD_RESPONSE", `Canvas returned an unexpected response (${res.status}).`, res.status);
    }

    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) {
      throw new CanvasApiError("BAD_RESPONSE", "Canvas returned more data than expected.");
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw new CanvasApiError("TIMEOUT", "Canvas took too long to respond. Try again in a moment.");
    }
    if (text.length > MAX_BODY_BYTES) {
      throw new CanvasApiError("BAD_RESPONSE", "Canvas returned more data than expected.");
    }
    let data: T;
    try {
      // Canvas prefixes some JSON with "while(1);" as an anti-hijacking measure.
      data = JSON.parse(text.replace(/^while\(1\);/, "")) as T;
    } catch {
      throw new CanvasApiError("BAD_RESPONSE", "That address didn't answer like a Canvas site.");
    }

    return { data, next: parseNextLink(res.headers.get("link")) };
  }

  protected paginateList<T>(path: string, params: Record<string, string | string[]>): Promise<T[]> {
    return this.paginate<T>(path, params);
  }

  private async paginate<T>(path: string, params: Record<string, string | string[]>): Promise<T[]> {
    const out: T[] = [];
    let { data, next } = await this.request<T[]>(path, { ...params, per_page: String(PER_PAGE) });
    if (!Array.isArray(data)) throw new CanvasApiError("BAD_RESPONSE", "Canvas returned an unexpected shape.");
    out.push(...data);
    let pages = 1;
    while (next && pages < MAX_PAGES) {
      ({ data, next } = await this.requestUrl<T[]>(next));
      if (!Array.isArray(data)) break;
      out.push(...data);
      pages++;
    }
    return out;
  }

  // --- Endpoints ---------------------------------------------------------------

  /** GET /api/v1/users/self — proves the token works and whose it is. */
  async getSelf(): Promise<CanvasUser> {
    const { data } = await this.request<CanvasUser>("/users/self");
    if (!data || typeof data.id !== "number" || typeof data.name !== "string") {
      throw new CanvasApiError("BAD_RESPONSE", "That address didn't answer like a Canvas site.");
    }
    return data;
  }

  /** GET /api/v1/courses — the student's active enrollments (as a student). */
  async listCourses(): Promise<CanvasCourse[]> {
    const courses = await this.paginate<CanvasCourse>("/courses", {
      enrollment_type: "student",
      enrollment_state: "active",
      "state[]": ["available"],
      "include[]": ["term"],
    });
    return courses.filter((c) => c && typeof c.id === "number" && typeof c.name === "string" && !c.access_restricted_by_date);
  }

  /** GET /api/v1/courses/:id/assignments with the student's own submission. */
  async listAssignments(courseId: string | number): Promise<CanvasAssignment[]> {
    const assignments = await this.paginate<CanvasAssignment>(`/courses/${encodeURIComponent(String(courseId))}/assignments`, {
      "include[]": ["submission"],
      order_by: "due_at",
    });
    return assignments.filter((a) => a && typeof a.id === "number" && typeof a.name === "string");
  }
}

/** Read-only course content endpoints. All GETs through the same guarded
 * request path; Rushd never writes to Canvas. */
export class CanvasContentClient extends CanvasClient {
  /** GET /courses/:id/modules?include[]=items, filling in items Canvas
   * leaves out for large modules from /modules/:id/items. */
  async listModules(courseId: string | number): Promise<CanvasModule[]> {
    const course = encodeURIComponent(String(courseId));
    const modules = (await this.paginateList<CanvasModule>(`/courses/${course}/modules`, { "include[]": ["items"] })).filter(
      (m) => m && typeof m.id === "number" && typeof m.name === "string",
    );
    for (const m of modules) {
      if (!Array.isArray(m.items) && (m.items_count ?? 0) > 0) {
        m.items = await this.paginateList<CanvasModuleItem>(`/courses/${course}/modules/${m.id}/items`, {});
      }
      m.items = (m.items ?? []).filter((i) => i && typeof i.id === "number" && typeof i.title === "string");
    }
    return modules;
  }

  /** GET /courses/:id/pages?include[]=body — published pages the student can see. */
  async listPages(courseId: string | number): Promise<CanvasPage[]> {
    const pages = await this.paginateList<CanvasPage>(`/courses/${encodeURIComponent(String(courseId))}/pages`, {
      "include[]": ["body"],
      sort: "title",
    });
    return pages.filter((p) => p && typeof p.url === "string" && typeof p.title === "string" && p.published !== false);
  }

  /** GET /announcements for one course, posted since `since`. */
  async listAnnouncements(courseId: string | number, since: Date, until: Date): Promise<CanvasAnnouncement[]> {
    const items = await this.paginateList<CanvasAnnouncement>("/announcements", {
      "context_codes[]": [`course_${String(courseId)}`],
      start_date: since.toISOString().slice(0, 10),
      end_date: until.toISOString().slice(0, 10),
      active_only: "true",
    });
    return items.filter((a) => a && typeof a.id === "number" && typeof a.title === "string");
  }
}

/** Parses an RFC 5988 Link header for rel="next". */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
}
