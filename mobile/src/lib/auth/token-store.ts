import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "@/lib/api/client";
import type { TokenPair } from "@/lib/api/types";

// Tokens live in the iOS keychain (expo-secure-store), readable only while
// the phone is unlocked and never synced to iCloud. Expo's web preview has
// no keychain, so there (development only) they go in localStorage.

const KEY = "rushd.tokens.v1";
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function parse(raw: string | null): TokenPair | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TokenPair;
    return typeof value.accessToken === "string" && typeof value.refreshToken === "string" ? value : null;
  } catch {
    return null;
  }
}

export const tokenStore: TokenStore = {
  async load() {
    if (Platform.OS === "web") return parse(globalThis.localStorage?.getItem(KEY) ?? null);
    return parse(await SecureStore.getItemAsync(KEY, options));
  },
  async save(tokens) {
    const raw = JSON.stringify(tokens);
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(KEY, raw);
      return;
    }
    await SecureStore.setItemAsync(KEY, raw, options);
  },
  async clear() {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(KEY);
      return;
    }
    await SecureStore.deleteItemAsync(KEY, options);
  },
};
