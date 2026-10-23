// The conversation history sent to the model, bounded by size. Pure.

/** Older turns beyond this many characters are dropped, newest kept first. */
export const HISTORY_CHARS = 24_000;

/** Stored messages come newest first; the model wants them oldest first.
 * Keeps the newest messages that fit in HISTORY_CHARS, starting on a user turn. */
export function toTurnHistory(newestFirst: { role: string; content: string }[], maxChars: number = HISTORY_CHARS) {
  const kept: { role: "user" | "assistant"; content: string }[] = [];
  let used = 0;
  for (const message of newestFirst) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    used += message.content.length;
    if (used > maxChars) break;
    kept.push({ role: message.role, content: message.content });
  }
  const history = kept.reverse();
  while (history.length && history[0].role !== "user") history.shift();
  return history;
}
