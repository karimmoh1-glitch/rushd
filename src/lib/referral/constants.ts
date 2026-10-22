// Shared by server code and public pages (no server-only imports).
export const BONUS_MESSAGES = 10;
export const MAX_FRIENDS = 10;
export const CODE_RE = /^[a-z2-9]{8}$/;
/** Actions that make an invite count: real study that can't be faked by
 * creating and checking off a dummy assignment. A study session must have
 * been open at least MIN_SESSION_MINUTES by the server's clock (the minutes a
 * student reports are their own estimate). */
export const QUALIFYING_EVENTS = ["study_session_completed", "assessment_completed", "draft_reviewed", "tutor_message"];
export const MIN_SESSION_MINUTES = 10;

export function qualifiesForReferral(name: string, properties?: Record<string, unknown>): boolean {
  if (!QUALIFYING_EVENTS.includes(name)) return false;
  if (name !== "study_session_completed") return true;
  return typeof properties?.elapsedMinutes === "number" && properties.elapsedMinutes >= MIN_SESSION_MINUTES;
}
