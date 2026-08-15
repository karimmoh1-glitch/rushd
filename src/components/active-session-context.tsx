"use client";

import { createContext, useContext, useState } from "react";
import type { ActiveSessionData } from "@/server/actions/study-sessions";

interface ActiveSessionContextValue {
  activeSession: ActiveSessionData | null;
  setActiveSession: (session: ActiveSessionData | null) => void;
}

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null);

/**
 * Client-owned "is there a session running" state, seeded once from the
 * server (`getActiveSession()` in the app layout) and from then on updated
 * only by explicit start/complete/abandon calls — never re-synced from
 * fresh server props on re-render. This lets a Start button on any page
 * (dashboard, assignments, exams) and the persistent bar in the app shell
 * agree on state without a page navigation, while a hard reload still
 * always gets the server's current truth on first mount.
 */
export function ActiveSessionProvider({
  initialSession,
  children,
}: {
  initialSession: ActiveSessionData | null;
  children: React.ReactNode;
}) {
  const [activeSession, setActiveSession] = useState(initialSession);
  return (
    <ActiveSessionContext.Provider value={{ activeSession, setActiveSession }}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  const ctx = useContext(ActiveSessionContext);
  if (!ctx) {
    throw new Error("useActiveSession must be used within an ActiveSessionProvider");
  }
  return ctx;
}
