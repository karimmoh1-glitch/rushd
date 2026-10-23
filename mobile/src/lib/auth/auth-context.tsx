import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { api, onSignedOut } from "@/lib/api";

type AuthState = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let active = true;
    api.isSignedIn().then((signedIn) => {
      if (active) setState(signedIn ? "signedIn" : "signedOut");
    });
    // The server ended the sign-in (refresh refused): back to sign in.
    const unsubscribe = onSignedOut(() => setState("signedOut"));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const device = Platform.OS === "ios" ? "iPhone" : Platform.OS === "web" ? "Web preview" : "Android";
    await api.signIn(email, password, `Rushd app (${device})`);
    setState("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setState("signedOut");
  }, []);

  const signOutEverywhere = useCallback(async () => {
    await api.signOutEverywhere();
    setState("signedOut");
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut, signOutEverywhere }), [state, signIn, signOut, signOutEverywhere]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
