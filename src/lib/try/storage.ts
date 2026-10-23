import { TRY_STORAGE_KEY } from "./parse-week";

// The week a visitor saved from "Rank my week", kept only in this browser.
// Cleared on logout (shared computers), but kept through login, because
// "Save my week" then "Log in" is how a returning student imports it.

const MAX_AGE_MS = 14 * 86_400_000;

/** The saved week as raw JSON, or null if there is none or it's over 14 days old. */
export function readFreshTry(): string | null {
  try {
    const raw = localStorage.getItem(TRY_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt?: number };
    const savedAt = saved.savedAt ?? 0;
    if (Date.now() - savedAt < MAX_AGE_MS) return raw;
    return null;
  } catch {
    // Storage blocked or the saved value is broken.
    return null;
  }
}

export function clearTry(): void {
  try {
    localStorage.removeItem(TRY_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was saved.
  }
}
