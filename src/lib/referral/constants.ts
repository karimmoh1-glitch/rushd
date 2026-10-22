// Shared by server code and public pages (no server-only imports).
export const BONUS_MESSAGES = 10;
export const MAX_FRIENDS = 10;
export const CODE_RE = /^[a-z2-9]{8}$/;
/** Actions that make an invite count: real study that can't be faked by
 * creating and checking off a dummy assignment. */
export const QUALIFYING_EVENTS = ["study_session_completed", "assessment_completed", "draft_reviewed", "tutor_message"];
