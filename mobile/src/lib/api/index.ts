import { createApiClient } from "./client";
import { tokenStore } from "@/lib/auth/token-store";

// The app's one API client. EXPO_PUBLIC_API_URL is inlined at build time:
// http://<your Mac's LAN IP>:3104 for Expo Go on a phone, or the production
// URL once the API is deployed. Defaults to the local dev server.

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3104";

const signedOutListeners = new Set<() => void>();

export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => {
    signedOutListeners.delete(listener);
  };
}

export const api = createApiClient({
  baseUrl: API_URL,
  store: tokenStore,
  onSignedOut: () => {
    for (const listener of signedOutListeners) listener();
  },
});

export { ApiError, isOfflineError } from "./client";
