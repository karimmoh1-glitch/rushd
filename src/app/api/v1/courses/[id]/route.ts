import { json, notFound, preflight, withUser } from "@/lib/api/v1/http";
import { getCourse } from "@/lib/api/v1/resources";

// GET /api/v1/courses/:id — the course with its open assignments and upcoming exams.

export const OPTIONS = preflight;

export async function GET(request: Request, ctx: RouteContext<"/api/v1/courses/[id]">) {
  return withUser(request, async (user) => {
    const { id } = await ctx.params;
    const detail = await getCourse(user.id, id);
    if (!detail) throw notFound("Course not found.");
    return json(request, detail);
  });
}
