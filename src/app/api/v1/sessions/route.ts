import { json, preflight, readBody, withUser } from "@/lib/api/v1/http";
import { StartSessionBody } from "@/lib/api/v1/schemas";
import { sessionError } from "@/lib/api/v1/session-errors";
import { startStudySession } from "@/lib/study-sessions/service";

// POST /api/v1/sessions — start a study session for one assignment or exam.
// Only one can be in progress at a time (409 otherwise).

export const OPTIONS = preflight;

export async function POST(request: Request) {
  return withUser(request, async (user) => {
    const body = await readBody(request, StartSessionBody);
    const target = "assignmentId" in body ? { assignmentId: body.assignmentId } : { examId: body.examId };
    const result = await startStudySession(user.id, target, body.source);
    if ("error" in result) throw sessionError(result.error);
    return json(request, { session: result.session }, 201);
  });
}
