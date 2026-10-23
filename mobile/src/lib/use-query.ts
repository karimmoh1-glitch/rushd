import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ApiError } from "@/lib/api";

// Loads data for a screen, reloads when the screen regains focus, and
// supports pull-to-refresh. Keeps the last good data on a failed reload, so
// going offline shows a banner over what was there instead of a blank page.

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean; // first load, nothing to show yet
  refreshing: boolean; // pull-to-refresh in progress
  loadedAt: number; // bumps every time fresh data arrives from the server
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setData: (update: (current: T | undefined) => T | undefined) => void;
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, "bad_response", "Something went wrong. Try again.");
}

export function useQuery<T>(load: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const generation = useRef(0);

  const run = useCallback(async (mode: "initial" | "refresh" | "silent") => {
    const mine = ++generation.current;
    if (mode === "refresh") setRefreshing(true);
    try {
      const next = await loadRef.current();
      if (mine !== generation.current) return;
      setDataState(next);
      setError(null);
      setLoadedAt(Date.now());
    } catch (caught) {
      if (mine !== generation.current) return;
      setError(asApiError(caught));
    } finally {
      if (mine === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void run("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Coming back to a screen (after a session, after adding work) shows fresh data.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void run("silent");
    }, [run]),
  );

  const setData = useCallback((update: (current: T | undefined) => T | undefined) => setDataState(update), []);

  return {
    data,
    error,
    loading,
    refreshing,
    loadedAt,
    refresh: () => run("refresh"),
    reload: () => run("silent"),
    setData,
  };
}
