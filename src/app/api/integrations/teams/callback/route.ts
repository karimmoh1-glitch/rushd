import { cookies } from "next/headers";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { connectTeams } from "@/lib/teams/service";
import { logEvent } from "@/lib/analytics/log-event";
import { TEAMS_OAUTH_COOKIE, TEAMS_OAUTH_COOKIE_PATH } from "../oauth-cookie";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";

const SavedOAuth = z.object({ state: z.string().min(16), verifier: z.string().min(32), uid: z.string() });

// These Microsoft errors mean a school admin has to approve the app first.
const ADMIN_CONSENT_ERRORS = /AADSTS(65001|90094|90095)/;

/** Picks which message to show when Microsoft sends back an error. */
function microsoftErrorQuery(error: string, description: string): string {
  if (ADMIN_CONSENT_ERRORS.test(description) || error === "consent_required") {
    return "error=admin_consent";
  }
  return "error=cancelled";
}

/** Microsoft redirects here. Verifies state and the signed-in user, then
 * exchanges the code. Never echoes the code or tokens anywhere. */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers);
  return withRequestIdHeader(await handleCallback(request, requestId), requestId);
}

async function handleCallback(request: Request, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  function backToTeamsPage(query: string) {
    if (query.startsWith("error=")) {
      log.warn("teams.oauth_callback_rejected", { requestId, reason: query.slice(6) });
    }
    return Response.redirect(`${url.origin}/integrations/teams?${query}`, 303);
  }

  // The saved state is single-use: read it, then delete the cookie right away.
  const jar = await cookies();
  const savedCookie = jar.get(TEAMS_OAUTH_COOKIE)?.value;
  jar.delete({ name: TEAMS_OAUTH_COOKIE, path: TEAMS_OAUTH_COOKIE_PATH });

  const user = await getCurrentUser();
  if (!user) {
    return Response.redirect(`${url.origin}/login`, 303);
  }

  const microsoftError = url.searchParams.get("error");
  if (microsoftError) {
    const description = url.searchParams.get("error_description") ?? "";
    return backToTeamsPage(microsoftErrorQuery(microsoftError, description));
  }

  let saved: z.infer<typeof SavedOAuth>;
  try {
    saved = SavedOAuth.parse(JSON.parse(savedCookie ?? ""));
  } catch {
    return backToTeamsPage("error=expired");
  }

  // The state must match what we saved, and the same user must still be signed in.
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || state !== saved.state) {
    return backToTeamsPage("error=state");
  }
  if (saved.uid !== user.id) {
    return backToTeamsPage("error=state");
  }
  if (!code) {
    return backToTeamsPage("error=state");
  }

  const result = await connectTeams(user.id, code, saved.verifier);
  if (!result.ok) {
    if (result.code === "CONSENT_REQUIRED") {
      return backToTeamsPage("error=admin_consent");
    }
    return backToTeamsPage("error=failed");
  }
  await logEvent(user.id, "teams_connected", { classes: result.value.classCount });
  return backToTeamsPage("connected=1");
}
