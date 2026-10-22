import { cookies } from "next/headers";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { connectTeams } from "@/lib/teams/service";
import { logEvent } from "@/lib/analytics/log-event";

const COOKIE = "rushd_teams_oauth";
const Saved = z.object({ state: z.string().min(16), verifier: z.string().min(32), uid: z.string() });

/** Microsoft redirects here. Verifies state and the signed-in user, then
 * exchanges the code. Never echoes the code or tokens anywhere. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => Response.redirect(`${url.origin}/integrations/teams?${q}`, 303);
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/integrations/teams" });

  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${url.origin}/login`, 303);

  const msError = url.searchParams.get("error");
  if (msError) {
    const desc = url.searchParams.get("error_description") ?? "";
    return back(/AADSTS(65001|90094|90095)/.test(desc) || msError === "consent_required" ? "error=admin_consent" : "error=cancelled");
  }

  let saved: z.infer<typeof Saved>;
  try {
    saved = Saved.parse(JSON.parse(raw ?? ""));
  } catch {
    return back("error=expired");
  }
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || state !== saved.state || saved.uid !== user.id || !code) return back("error=state");

  const result = await connectTeams(user.id, code, saved.verifier);
  if (!result.ok) return back(`error=${result.code === "CONSENT_REQUIRED" ? "admin_consent" : "failed"}`);
  await logEvent(user.id, "teams_connected", { classes: result.value.classCount });
  return back("connected=1");
}
