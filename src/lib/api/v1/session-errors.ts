import "server-only";
import { ApiError } from "@/lib/api/v1/http";

/** Maps the study-session service's messages to API errors. */
export function sessionError(message: string): ApiError {
  if (message.endsWith("not found.")) return new ApiError(404, "not_found", message);
  if (message.startsWith("You already have an active study session")) return new ApiError(409, "conflict", message);
  if (message === "This session was already finished.") return new ApiError(409, "conflict", message);
  return new ApiError(400, "invalid_request", message);
}
