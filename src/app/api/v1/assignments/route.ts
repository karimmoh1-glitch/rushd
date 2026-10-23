import { ApiError, badRequest, json, notFound, preflight, readBody, withUser } from "@/lib/api/v1/http";
import { AssignmentListQuery, CreateAssignmentBody } from "@/lib/api/v1/schemas";
import { getAssignment, listAssignments } from "@/lib/api/v1/resources";
import { createAssignmentForUser } from "@/lib/assignments/service";

// GET  /api/v1/assignments?status=open|completed|all — ranked like the web list.
// POST /api/v1/assignments — add one to a course the student owns.

export const OPTIONS = preflight;

export async function GET(request: Request) {
  return withUser(request, async (user) => {
    const parsed = AssignmentListQuery.safeParse(new URL(request.url).searchParams.get("status") ?? undefined);
    if (!parsed.success) throw badRequest("status must be open, completed, or all.");
    return json(request, { assignments: await listAssignments(user.id, parsed.data) });
  });
}

export async function POST(request: Request) {
  return withUser(request, async (user) => {
    const body = await readBody(request, CreateAssignmentBody);
    const result = await createAssignmentForUser(user.id, {
      classId: body.courseId,
      title: body.title,
      dueAt: new Date(body.dueAt).toISOString(),
      estimatedMinutes: body.estimatedMinutes,
      priority: body.priority,
      status: "NOT_STARTED",
      notes: body.notes,
    });
    if ("error" in result) {
      if (result.error === "Class not found.") throw notFound("Course not found.");
      throw new ApiError(400, "invalid_request", result.error);
    }
    const created = await getAssignment(user.id, result.id);
    if (!created) throw notFound("Assignment not found.");
    return json(request, { assignment: created }, 201);
  });
}
