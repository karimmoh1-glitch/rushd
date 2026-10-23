import "server-only";
import * as z from "zod";

// A read-only Microsoft Graph client for Teams for Education.
// Security: "next page" links are only followed if they stay on graph.microsoft.com.

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 15_000;

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NETWORK" | "BAD_RESPONSE",
  ) {
    super(message);
  }
}

const ClassSchema = z.object({ id: z.string(), displayName: z.string().nullish() });
const SubmissionSchema = z.object({ status: z.string().nullish() });
const AssignmentSchema = z.object({
  id: z.string(),
  classId: z.string(),
  displayName: z.string().nullish(),
  dueDateTime: z.string().nullish(),
  status: z.string().nullish(),
  webUrl: z.string().nullish(),
  grading: z.object({ maxPoints: z.number().nullish() }).passthrough().nullish(),
  submissions: z.array(SubmissionSchema).nullish(),
});
type GraphClass = z.infer<typeof ClassSchema>;
export type GraphAssignment = z.infer<typeof AssignmentSchema>;

interface GraphPage {
  value: unknown[];
  next: string | null;
}

/** Fetches one page of a Graph list. */
async function getPage(url: string, token: string, fetchImpl: typeof fetch): Promise<GraphPage> {
  if (!url.startsWith(`${GRAPH}/`)) {
    throw new GraphError("Unexpected link from Microsoft Graph.", "BAD_RESPONSE");
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GraphError("Couldn't reach Microsoft Teams. Try again.", "NETWORK");
  }

  if (res.status === 401) {
    throw new GraphError("Teams stopped accepting the connection. Reconnect Teams.", "UNAUTHORIZED");
  }
  if (res.status === 403) {
    throw new GraphError("Your school hasn't allowed Rushd to read Teams assignments.", "FORBIDDEN");
  }
  if (!res.ok) {
    throw new GraphError(`Microsoft Teams returned an error (${res.status}).`, "BAD_RESPONSE");
  }

  let body: { value?: unknown[]; "@odata.nextLink"?: string } | null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!body || !Array.isArray(body.value)) {
    throw new GraphError("Microsoft Teams returned an unexpected response.", "BAD_RESPONSE");
  }
  return { value: body.value, next: body["@odata.nextLink"] ?? null };
}

/** Fetches every page (up to MAX_PAGES), keeping only items that match the schema. */
async function getAll<T>(path: string, token: string, schema: z.ZodType<T>, fetchImpl: typeof fetch): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${GRAPH}${path}`;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const graphPage: GraphPage = await getPage(url, token, fetchImpl);
    for (const item of graphPage.value) {
      const parsed = schema.safeParse(item);
      if (parsed.success) {
        results.push(parsed.data);
      }
    }
    url = graphPage.next;
  }
  return results;
}

export async function getMe(token: string, fetchImpl: typeof fetch = fetch): Promise<{ name: string | null; tenantId: string | null }> {
  let res: Response;
  try {
    res = await fetchImpl(`${GRAPH}/me?$select=displayName`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GraphError("Couldn't reach Microsoft.", "NETWORK");
  }

  if (!res.ok) {
    const code = res.status === 401 ? "UNAUTHORIZED" : "BAD_RESPONSE";
    throw new GraphError("Couldn't read your Microsoft account.", code);
  }

  let body: { displayName?: string };
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const name = typeof body.displayName === "string" ? body.displayName.slice(0, 120) : null;
  return { name, tenantId: null };
}

export function listClasses(token: string, fetchImpl: typeof fetch = fetch): Promise<GraphClass[]> {
  return getAll("/education/me/classes?$select=id,displayName", token, ClassSchema, fetchImpl);
}

/** The student's assignments across all classes, with their own submission. */
export function listAssignments(token: string, fetchImpl: typeof fetch = fetch): Promise<GraphAssignment[]> {
  return getAll("/education/me/assignments?$expand=submissions&$top=100", token, AssignmentSchema, fetchImpl);
}
