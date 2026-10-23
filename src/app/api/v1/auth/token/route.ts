import * as z from "zod";
import { LoginSchema } from "@/lib/validation/auth";
import { verifyCredentials } from "@/lib/auth/credentials";
import { issueTokenPair } from "@/lib/api/v1/tokens";
import { ApiError, clientIp, enforceRateLimit, handle, json, preflight, readBody } from "@/lib/api/v1/http";
import { logEvent } from "@/lib/analytics/log-event";

// POST /api/v1/auth/token — email + password for an access/refresh token pair.
// The same password check, rate limit bucket, and enumeration-safe error as
// the web login form (src/server/actions/auth.ts).

const BodySchema = LoginSchema.extend({
  deviceName: z.string().trim().max(80).optional(),
});

/** Sign-in attempts per IP per 15 minutes, across all emails. */
const TOKEN_IP_LIMIT = 30;

export const OPTIONS = preflight;

export async function POST(request: Request) {
  return handle(request, async () => {
    const ip = clientIp(request);
    await enforceRateLimit(`api-token:${ip}`, TOKEN_IP_LIMIT);
    const { email, password, deviceName } = await readBody(request, BodySchema);
    // The web login's own bucket, so the two can't be combined for more guesses.
    await enforceRateLimit(`login:${ip}:${email}`, 10);

    const user = await verifyCredentials(email, password);
    if (!user) throw new ApiError(401, "invalid_credentials", "Invalid email or password.");

    const tokens = await issueTokenPair(user, deviceName || null);
    await logEvent(user.id, "api_signed_in", { client: "mobile" });
    return json(request, { ...tokens, onboardingCompleted: user.onboardingCompletedAt !== null });
  });
}
