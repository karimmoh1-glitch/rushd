import { json, preflight, readBody, withUser } from "@/lib/api/v1/http";
import { CompleteSessionBody } from "@/lib/api/v1/schemas";
import { sessionError } from "@/lib/api/v1/session-errors";
import { completeStudySession } from "@/lib/study-sessions/service";

// POST /api/v1/sessions/:id/complete — { actualMinutes, difficulty? }. The
// student confirms the minutes; the app's timer is only a suggestion.

export const OPTIONS = preflight;

export async function POST(request: Request, ctx: RouteContext<"/api/v1/sessions/[id]/complete">) {
  return withUser(request, async (user) => {
    const { id } = await ctx.params;
    const body = await readBody(request, CompleteSessionBody);
    const result = await completeStudySession(user.id, id, body.actualMinutes, body.difficulty);
    if ("error" in result) throw sessionError(result.error);
    return json(request, { summary: result.summary });
  });
}
