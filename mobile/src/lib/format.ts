// Small formatting helpers, matching the web's src/lib/format.ts.

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** "12:05" or "1:02:09" for the session timer. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** Minutes elapsed since an ISO time, at least 1 (what the complete form suggests). */
export function elapsedMinutes(startedAt: string, now = Date.now()): number {
  return Math.max(1, Math.round((now - new Date(startedAt).getTime()) / 60_000));
}
