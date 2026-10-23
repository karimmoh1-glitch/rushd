import { json, preflight, withUser } from "@/lib/api/v1/http";
import { getActiveStudySession } from "@/lib/study-sessions/service";

// GET /api/v1/sessions/active — the in-progress session, or null.

export const OPTIONS = preflight;

export async function GET(request: Request) {
  return withUser(request, async (user) => json(request, { session: await getActiveStudySession(user.id) }));
}
