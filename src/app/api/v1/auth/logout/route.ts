import * as z from "zod";
import { familyOfRefreshToken, revokeFamily, signOutEverywhereForUser } from "@/lib/api/v1/tokens";
import { authenticate, clientIp, enforceRateLimit, handle, noContent, preflight, readBody } from "@/lib/api/v1/http";

// POST /api/v1/auth/logout
//   { refreshToken }      ends this device's sign-in (no access token needed:
//                         holding the refresh token is the proof).
//   { everywhere: true }  needs a valid access token; signs the student out of
//                         every device and every web session.

const BodySchema = z.object({
  refreshToken: z.string().min(1).max(200).optional(),
  everywhere: z.boolean().optional(),
});

export const OPTIONS = preflight;

export async function POST(request: Request) {
  return handle(request, async () => {
    await enforceRateLimit(`api-refresh:${clientIp(request)}`, 120);
    const body = await readBody(request, BodySchema);

    if (body.everywhere) {
      const user = await authenticate(request);
      await signOutEverywhereForUser(user.id);
      return noContent(request);
    }

    if (body.refreshToken) {
      const family = await familyOfRefreshToken(body.refreshToken);
      if (family) await revokeFamily(family.familyId);
      // Unknown tokens get the same answer: logout is idempotent.
      return noContent(request);
    }

    // No refresh token: end the sign-in the access token belongs to.
    const user = await authenticate(request);
    await revokeFamily(user.familyId);
    return noContent(request);
  });
}
