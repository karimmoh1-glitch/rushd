import "server-only";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { resolvePublicAddresses, CanvasUrlError } from "./base-url";
import type { CanvasAnnouncement, CanvasModule, CanvasModuleItem, CanvasPage } from "./content";

// A small read-only Canvas REST client with just what the sync needs.
// Docs: https://developerdocs.instructure.com/services/canvas
// Security rules:
//  - The hostname's addresses are checked (base-url.ts) and the connection is
//    pinned to them, so a DNS change between check and connect can't reroute us.
//  - Redirects are never followed (a redirect could point at a private host).
//  - Timeouts on connect/headers/body, and a maximum response size.
//  - The token only goes in the Authorization header: never in a URL, a log, or an error.

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
  // Canvas also sends score/grade here; Rushd deliberately never reads or stores them.
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
  // Checked by parseRubric (content.ts) before anything stores it.
  rubric?: unknown;
}

const CONNECT_TIMEOUT_MS = 8_000;
const HEADERS_TIMEOUT_MS = 15_000;
const BODY_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 50; // 50 pages × 100 per page = 5,000 records, far more than any student has
const PER_PAGE = 100;
const USER_AGENT = "Rushd/1.0 (+https://therushd.com)";

type QueryParams = Record<string, string | string[]>;
type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>;
type LookupCallback = (err: Error | null, address: unknown, family?: number) => void;

/**
 * Makes an HTTP agent that only ever connects to the given (already checked)
 * addresses, taking turns between them. This is the "pinned DNS" protection.
 * Also used by the calendar feed fetcher.
 */
export function createPinnedAgent(addresses: string[]): Agent {
  let nextIndex = 0;

  // Node calls lookup either wanting one address, or (with `all: true`) a list.
  function pinnedLookup(_hostname: string, options: { all?: boolean }, callback: LookupCallback) {
    const address = addresses[nextIndex % addresses.length];
    nextIndex++;
    const family = address.includes(":") ? 6 : 4;
    if (options?.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  }

  return new Agent({
    connect: {
      timeout: CONNECT_TIMEOUT_MS,
      lookup: pinnedLookup as never,
    },
    headersTimeout: HEADERS_TIMEOUT_MS,
    bodyTimeout: BODY_TIMEOUT_MS,
    // No redirect interceptor is installed and requests use redirect: "manual",
    // so a 3xx comes back to us (and is rejected), never followed.
  });
}

/** Turns a failed fetch (network problem or timeout) into a CanvasApiError. */
function toNetworkError(error: unknown): CanvasApiError {
  if (error instanceof CanvasUrlError) {
    return new CanvasApiError("UNSAFE_URL", error.message);
  }
  const message = String((error as Error)?.cause ?? error);
  const isTimeout = /timeout|timed out|ETIMEDOUT|UND_ERR_(CONNECT|HEADERS|BODY)_TIMEOUT/i.test(message);
  if (isTimeout) {
    return new CanvasApiError("TIMEOUT", "Canvas took too long to respond. Try again in a moment.");
  }
  return new CanvasApiError("NETWORK", "Couldn't reach Canvas. Check the address and your connection.");
}

/** Throws a friendly CanvasApiError for any response that isn't a normal success. */
function checkStatus(res: FetchResponse): void {
  const status = res.status;

  if (status >= 300 && status < 400) {
    throw new CanvasApiError("NOT_FOUND", "That address redirected somewhere else. Use your school's exact Canvas address.", status);
  }
  if (status === 401) {
    throw new CanvasApiError("UNAUTHORIZED", "Canvas rejected this token. It may be expired or revoked.", 401);
  }
  if (status === 403) {
    // Canvas also uses 403 for rate limiting, with a special header.
    const remaining = res.headers.get("x-rate-limit-remaining");
    if (remaining !== null && Number(remaining) <= 0) {
      throw new CanvasApiError("RATE_LIMITED", "Canvas is rate-limiting requests. Try again shortly.", 403);
    }
    throw new CanvasApiError("FORBIDDEN", "This token doesn't have permission to read that.", 403);
  }
  if (status === 404) {
    throw new CanvasApiError("NOT_FOUND", "No Canvas API found at that address.", 404);
  }
  if (status === 429) {
    throw new CanvasApiError("RATE_LIMITED", "Canvas is rate-limiting requests. Try again shortly.", 429);
  }
  if (status >= 500) {
    throw new CanvasApiError("SERVER_ERROR", "Canvas is having trouble right now. Try again later.", status);
  }
  if (!res.ok) {
    throw new CanvasApiError("BAD_RESPONSE", `Canvas returned an unexpected response (${status}).`, status);
  }
}

/** Reads the response body as JSON, refusing anything too large. */
async function readJsonBody<T>(res: FetchResponse): Promise<T> {
  const declaredLength = Number(res.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
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

  try {
    // Canvas puts "while(1);" before some JSON to stop JSON hijacking.
    return JSON.parse(text.replace(/^while\(1\);/, "")) as T;
  } catch {
    throw new CanvasApiError("BAD_RESPONSE", "That address didn't answer like a Canvas site.");
  }
}

interface ClientOptions {
  /** For tests only: skips the DNS lookup (and its checks). Production never passes this. */
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
    if (this.dispatcher) {
      return this.dispatcher;
    }
    if (!this.addresses) {
      this.addresses = await resolvePublicAddresses(this.baseUrl);
    }
    this.dispatcher = createPinnedAgent(this.addresses);
    return this.dispatcher;
  }

  async close(): Promise<void> {
    await this.dispatcher?.close();
    this.dispatcher = null;
  }

  private async request<T>(path: string, params: QueryParams = {}): Promise<{ data: T; next: string | null }> {
    const url = new URL(`/api/v1${path}`, this.baseUrl);
    for (const [name, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(name, item);
        }
      } else {
        url.searchParams.set(name, value);
      }
    }
    return this.requestUrl<T>(url.toString());
  }

  private async requestUrl<T>(absoluteUrl: string): Promise<{ data: T; next: string | null }> {
    // "next" page links come from Canvas, so refuse any that leave the checked site.
    if (!absoluteUrl.startsWith(`${this.baseUrl}/`)) {
      throw new CanvasApiError("UNSAFE_URL", "Canvas returned a link to a different site.");
    }

    let res: FetchResponse;
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
      throw toNetworkError(error);
    }

    checkStatus(res);
    const data = await readJsonBody<T>(res);
    return { data, next: parseNextLink(res.headers.get("link")) };
  }

  /** Fetches every page of a list endpoint (up to MAX_PAGES). */
  protected async paginate<T>(path: string, params: QueryParams): Promise<T[]> {
    const results: T[] = [];

    const firstPage = await this.request<T[]>(path, { ...params, per_page: String(PER_PAGE) });
    if (!Array.isArray(firstPage.data)) {
      throw new CanvasApiError("BAD_RESPONSE", "Canvas returned an unexpected shape.");
    }
    results.push(...firstPage.data);

    let nextUrl = firstPage.next;
    let pageCount = 1;
    while (nextUrl && pageCount < MAX_PAGES) {
      const page = await this.requestUrl<T[]>(nextUrl);
      if (!Array.isArray(page.data)) {
        break;
      }
      results.push(...page.data);
      nextUrl = page.next;
      pageCount++;
    }
    return results;
  }

  /** GET /api/v1/users/self: proves the token works and whose it is. */
  async getSelf(): Promise<CanvasUser> {
    const { data } = await this.request<CanvasUser>("/users/self");
    if (!data || typeof data.id !== "number" || typeof data.name !== "string") {
      throw new CanvasApiError("BAD_RESPONSE", "That address didn't answer like a Canvas site.");
    }
    return data;
  }

  /** GET /api/v1/courses: the courses the student is actively enrolled in. */
  async listCourses(): Promise<CanvasCourse[]> {
    const courses = await this.paginate<CanvasCourse>("/courses", {
      enrollment_type: "student",
      enrollment_state: "active",
      "state[]": ["available"],
      "include[]": ["term"],
    });
    return courses.filter((course) => {
      return course && typeof course.id === "number" && typeof course.name === "string" && !course.access_restricted_by_date;
    });
  }

  /** GET /api/v1/courses/:id/assignments, including the student's own submission. */
  async listAssignments(courseId: string | number): Promise<CanvasAssignment[]> {
    const path = `/courses/${encodeURIComponent(String(courseId))}/assignments`;
    const assignments = await this.paginate<CanvasAssignment>(path, {
      "include[]": ["submission"],
      order_by: "due_at",
    });
    return assignments.filter((assignment) => {
      return assignment && typeof assignment.id === "number" && typeof assignment.name === "string";
    });
  }
}

/** Read-only course content. Uses the same protected request path; Rushd never writes to Canvas. */
export class CanvasContentClient extends CanvasClient {
  /** GET /courses/:id/modules with items. Large modules leave items out, so
   * those are fetched separately from /modules/:id/items. */
  async listModules(courseId: string | number): Promise<CanvasModule[]> {
    const course = encodeURIComponent(String(courseId));
    const allModules = await this.paginate<CanvasModule>(`/courses/${course}/modules`, { "include[]": ["items"] });
    const modules = allModules.filter((canvasModule) => {
      return canvasModule && typeof canvasModule.id === "number" && typeof canvasModule.name === "string";
    });

    for (const canvasModule of modules) {
      const itemsMissing = !Array.isArray(canvasModule.items) && (canvasModule.items_count ?? 0) > 0;
      if (itemsMissing) {
        canvasModule.items = await this.paginate<CanvasModuleItem>(`/courses/${course}/modules/${canvasModule.id}/items`, {});
      }
      canvasModule.items = (canvasModule.items ?? []).filter((item) => {
        return item && typeof item.id === "number" && typeof item.title === "string";
      });
    }
    return modules;
  }

  /** GET /courses/:id/pages with body: published pages the student can see. */
  async listPages(courseId: string | number): Promise<CanvasPage[]> {
    const pages = await this.paginate<CanvasPage>(`/courses/${encodeURIComponent(String(courseId))}/pages`, {
      "include[]": ["body"],
      sort: "title",
    });
    return pages.filter((page) => {
      return page && typeof page.url === "string" && typeof page.title === "string" && page.published !== false;
    });
  }

  /** GET /announcements for one course, between `since` and `until`. */
  async listAnnouncements(courseId: string | number, since: Date, until: Date): Promise<CanvasAnnouncement[]> {
    const announcements = await this.paginate<CanvasAnnouncement>("/announcements", {
      "context_codes[]": [`course_${String(courseId)}`],
      start_date: since.toISOString().slice(0, 10),
      end_date: until.toISOString().slice(0, 10),
      active_only: "true",
    });
    return announcements.filter((announcement) => {
      return announcement && typeof announcement.id === "number" && typeof announcement.title === "string";
    });
  }
}

/** Finds the rel="next" link in a Link header. */
export function parseNextLink(header: string | null): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}
