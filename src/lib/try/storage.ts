import { TRY_STORAGE_KEY } from "./parse-week";

// The week a visitor saved from "Rank my week", kept only in this browser.
// Read in one place so its expiry is the same everywhere; cleared on login
// and logout so it never follows someone else's session on a shared computer.

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
