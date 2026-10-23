import { json, preflight, withUser } from "@/lib/api/v1/http";
import { listCourses } from "@/lib/api/v1/resources";

// GET /api/v1/courses — active courses first, then archived.

export const OPTIONS = preflight;

export async function GET(request: Request) {
  return withUser(request, async (user) => json(request, { courses: await listCourses(user.id) }));
}
