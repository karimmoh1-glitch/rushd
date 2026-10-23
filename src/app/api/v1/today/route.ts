import { json, preflight, withUser } from "@/lib/api/v1/http";
import { getTodaySummary } from "@/lib/today/summary";

// GET /api/v1/today — the Today screen: next up with reasons, today's blocks,
// coming up, this week, and study time per course. Same logic as the web dashboard.

export const OPTIONS = preflight;

export async function GET(request: Request) {
  return withUser(request, async (user) => json(request, { today: await getTodaySummary(user.id) }));
}
