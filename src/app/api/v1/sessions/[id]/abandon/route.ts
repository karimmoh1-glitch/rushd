import { json, preflight, readBody, withUser } from "@/lib/api/v1/http";
import { AbandonSessionBody } from "@/lib/api/v1/schemas";
import { sessionError } from "@/lib/api/v1/session-errors";
import { abandonStudySession } from "@/lib/study-sessions/service";

// POST /api/v1/sessions/:id/abandon — { reason? }. Students never have to explain.

export const OPTIONS = preflight;

export async function POST(request: Request, ctx: RouteContext<"/api/v1/sessions/[id]/abandon">) {
  return withUser(request, async (user) => {
    const { id } = await ctx.params;
    const body = await readBody(request, AbandonSessionBody);
    const result = await abandonStudySession(user.id, id, body.reason);
    if ("error" in result) throw sessionError(result.error);
    return json(request, { ok: true });
  });
}
