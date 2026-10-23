import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/dal";
import { authorizeUrl, newPkce } from "@/lib/teams/oauth";
import { teamsAvailable } from "@/lib/teams/service";
import { TEAMS_OAUTH_COOKIE, TEAMS_OAUTH_COOKIE_PATH } from "../oauth-cookie";

/** Starts "Connect Microsoft Teams": PKCE + state, then off to Microsoft. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getCurrentUser();
  if (!user) {
    return Response.redirect(`${origin}/login`, 303);
  }
  if (!teamsAvailable()) {
    return Response.redirect(`${origin}/integrations/teams?error=unavailable`, 303);
  }

  const { verifier, challenge, state } = newPkce();
  const jar = await cookies();
  jar.set(TEAMS_OAUTH_COOKIE, JSON.stringify({ state, verifier, uid: user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: TEAMS_OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(state, challenge), 303);
}
