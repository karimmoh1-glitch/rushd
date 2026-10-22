import { TRY_STORAGE_KEY } from "./parse-week";

// The week a visitor saved from "Rank my week", kept only in this browser.
// Read in one place so its expiry is the same everywhere. Cleared on logout,
// so it doesn't wait for the next person on a shared computer; kept through
// login, because "Save my week" then "Log in" is how a returning student
// brings it into their account.

const MAX_AGE = 14 * 86_400_000;

export function readFreshTry(): string | null {
  try {
    const raw = localStorage.getItem(TRY_STORAGE_KEY);
    if (!raw) return null;
    const savedAt = (JSON.parse(raw) as { savedAt?: number }).savedAt ?? 0;
    return Date.now() - savedAt < MAX_AGE ? raw : null;
  } catch {
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
