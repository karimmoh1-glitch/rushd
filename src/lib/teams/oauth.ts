import "server-only";
import { createHash, randomBytes } from "node:crypto";
import * as z from "zod";

// Microsoft sign-in (OAuth authorization code flow with PKCE). The hosts are
// fixed (login.microsoftonline.com), so there's no user-controlled URL to
// guard. All scopes are read-only.

const TEAMS_SCOPES = ["openid", "profile", "offline_access", "User.Read", "EduRoster.ReadBasic", "EduAssignments.ReadBasic"];
const TOKEN_TIMEOUT_MS = 15_000;

export function teamsConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function tenant(): string {
  // "organizations" means any work or school account; the education APIs
  // don't support personal Microsoft accounts.
  const tenantId = process.env.MICROSOFT_TENANT_ID || "organizations";
  // It goes into a URL path, so only allow safe characters.
  if (!/^[A-Za-z0-9.-]{1,100}$/.test(tenantId)) {
    throw new Error("Invalid MICROSOFT_TENANT_ID");
  }
  return tenantId;
}

function redirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/integrations/teams/callback`;
}

/** Makes a fresh PKCE verifier/challenge pair and a random state value. */
export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  return { verifier, challenge, state };
}

export function authorizeUrl(state: string, challenge: string): string {
  const url = new URL(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`);
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: TEAMS_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  url.search = params.toString();
  return url.toString();
}

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().optional(),
});
export type Tokens = z.infer<typeof TokenResponse>;

export class TeamsAuthError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_GRANT" | "CONSENT_REQUIRED" | "NETWORK" | "BAD_RESPONSE",
  ) {
    super(message);
  }
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<Tokens> {
  let res: Response;
  try {
    res = await fetchImpl(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        scope: TEAMS_SCOPES.join(" "),
        ...params,
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    throw new TeamsAuthError("Couldn't reach Microsoft. Try again.", "NETWORK");
  }

  let body: { error?: string; error_description?: string } | null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const description = body?.error_description ?? "";
    // AADSTS65001/90094/90095: the school requires an administrator to approve the app.
    if (/AADSTS(65001|90094|90095)/.test(description)) {
      throw new TeamsAuthError("Your school needs an administrator to approve Rushd before you can connect Teams.", "CONSENT_REQUIRED");
    }
    throw new TeamsAuthError("Microsoft didn't accept the sign-in. Reconnect Teams.", "INVALID_GRANT");
  }

  const parsed = TokenResponse.safeParse(body);
  if (!parsed.success) {
    throw new TeamsAuthError("Microsoft returned an unexpected response.", "BAD_RESPONSE");
  }
  return parsed.data;
}

export function exchangeCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<Tokens> {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier },
    fetchImpl,
  );
}

export function refreshTokens(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<Tokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}
