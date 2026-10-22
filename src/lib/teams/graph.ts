import "server-only";
import * as z from "zod";

// Read-only Microsoft Graph client for Teams for Education. Pagination links
// are only followed when they stay on graph.microsoft.com.

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_PAGES = 20;

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
export type GraphClass = z.infer<typeof ClassSchema>;
export type GraphAssignment = z.infer<typeof AssignmentSchema>;

async function get(url: string, token: string, fetchImpl: typeof fetch): Promise<{ value: unknown[]; next: string | null }> {
  if (!url.startsWith(`${GRAPH}/`)) throw new GraphError("Unexpected link from Microsoft Graph.", "BAD_RESPONSE");
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new GraphError("Couldn't reach Microsoft Teams. Try again.", "NETWORK");
  }
  if (res.status === 401) throw new GraphError("Teams stopped accepting the connection. Reconnect Teams.", "UNAUTHORIZED");
  if (res.status === 403) throw new GraphError("Your school hasn't allowed Rushd to read Teams assignments.", "FORBIDDEN");
  if (!res.ok) throw new GraphError(`Microsoft Teams returned an error (${res.status}).`, "BAD_RESPONSE");
  const body = (await res.json().catch(() => null)) as { value?: unknown[]; "@odata.nextLink"?: string } | null;
  if (!body || !Array.isArray(body.value)) throw new GraphError("Microsoft Teams returned an unexpected response.", "BAD_RESPONSE");
  return { value: body.value, next: body["@odata.nextLink"] ?? null };
}

async function getAll<T>(path: string, token: string, schema: z.ZodType<T>, fetchImpl: typeof fetch): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${GRAPH}${path}`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const { value, next }: { value: unknown[]; next: string | null } = await get(url, token, fetchImpl);
    for (const v of value) {
      const parsed = schema.safeParse(v);
      if (parsed.success) out.push(parsed.data);
    }
    url = next;
  }
  return out;
}

export async function getMe(token: string, fetchImpl: typeof fetch = fetch): Promise<{ name: string | null; tenantId: string | null }> {
  let res: Response;
  try {
    res = await fetchImpl(`${GRAPH}/me?$select=displayName`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new GraphError("Couldn't reach Microsoft.", "NETWORK");
  }
  if (!res.ok) throw new GraphError("Couldn't read your Microsoft account.", res.status === 401 ? "UNAUTHORIZED" : "BAD_RESPONSE");
  const body = (await res.json().catch(() => ({}))) as { displayName?: string };
  return { name: typeof body.displayName === "string" ? body.displayName.slice(0, 120) : null, tenantId: null };
}

export function listClasses(token: string, fetchImpl: typeof fetch = fetch): Promise<GraphClass[]> {
  return getAll("/education/me/classes?$select=id,displayName", token, ClassSchema, fetchImpl);
}

/** The student's assignments across all classes, with their own submission. */
export function listAssignments(token: string, fetchImpl: typeof fetch = fetch): Promise<GraphAssignment[]> {
  return getAll("/education/me/assignments?$expand=submissions&$top=100", token, AssignmentSchema, fetchImpl);
}
