import * as z from "zod";
import { rotateRefreshToken } from "@/lib/api/v1/tokens";
import { ApiError, clientIp, enforceRateLimit, handle, json, preflight, readBody } from "@/lib/api/v1/http";

// POST /api/v1/auth/refresh — rotates a refresh token. Presenting one that was
// already used revokes every token from that sign-in (reuse detection).

const BodySchema = z.object({ refreshToken: z.string().min(1).max(200) });

const REFRESH_IP_LIMIT = 120;

export const OPTIONS = preflight;

export async function POST(request: Request) {
  return handle(request, async () => {
    await enforceRateLimit(`api-refresh:${clientIp(request)}`, REFRESH_IP_LIMIT);
    const { refreshToken } = await readBody(request, BodySchema);
    const outcome = await rotateRefreshToken(refreshToken);
    if (!outcome.ok) {
      if (outcome.reason === "reused") {
        throw new ApiError(401, "refresh_token_reused", "This sign-in was ended for safety. Sign in again.");
      }
      throw new ApiError(401, "refresh_token_invalid", "Your sign-in expired. Sign in again.");
    }
    return json(request, outcome.tokens);
  });
}
