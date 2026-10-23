import { badRequest, json, notFound, preflight, readBody, withUser } from "@/lib/api/v1/http";
import { UpdateAssignmentBody } from "@/lib/api/v1/schemas";
import { getAssignment, getAssignmentForEdit } from "@/lib/api/v1/resources";
import { setAssignmentStatusForUser, updateAssignmentForUser } from "@/lib/assignments/service";

// GET   /api/v1/assignments/:id
// PATCH /api/v1/assignments/:id — { status } alone marks it done / not done;
// any other fields are merged into the current values and saved through the
// same service as the web's edit form (Canvas still owns title, date, course).

export const OPTIONS = preflight;

export async function GET(request: Request, ctx: RouteContext<"/api/v1/assignments/[id]">) {
  return withUser(request, async (user) => {
    const { id } = await ctx.params;
    const assignment = await getAssignment(user.id, id);
    if (!assignment) throw notFound("Assignment not found.");
    return json(request, { assignment });
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/assignments/[id]">) {
  return withUser(request, async (user) => {
    const { id } = await ctx.params;
    const body = await readBody(request, UpdateAssignmentBody);
    const existing = await getAssignmentForEdit(user.id, id);
    if (!existing) throw notFound("Assignment not found.");

    const onlyStatus = Object.keys(body).length === 1 && body.status !== undefined;
    let result;
    if (onlyStatus && body.status) {
      result = await setAssignmentStatusForUser(user.id, id, body.status);
    } else {
      let notes: string | undefined = existing.notes ?? undefined;
      if (body.notes !== undefined) notes = body.notes ?? undefined;
      result = await updateAssignmentForUser(user.id, id, {
        classId: body.courseId ?? existing.classId,
        title: body.title ?? existing.title,
        dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : existing.dueAt.toISOString(),
        estimatedMinutes: body.estimatedMinutes ?? existing.estimatedMinutes,
        priority: body.priority ?? existing.priority,
        status: body.status ?? existing.status,
        notes,
      });
    }
    if ("error" in result) {
      if (result.error === "Class not found.") throw notFound("Course not found.");
      if (result.error === "Assignment not found.") throw notFound("Assignment not found.");
      throw badRequest(result.error);
    }
    const assignment = await getAssignment(user.id, id);
    if (!assignment) throw notFound("Assignment not found.");
    return json(request, { assignment });
  });
}
