// Pulse: how strongly an item needs you right now, 1-99. A presentation of
// the engine's priority score (deadline, weight, overdue, exam proximity,
// effort), so it always agrees with the order Rushd plans in. The curve
// keeps the top end meaningful instead of saturating: a high-priority item
// that's overdue reads ~85, due today ~65, due next week ~20.

const SCALE = 110;

export type PulseLevel = "high" | "rising" | "calm";

export function pulseOf(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 1;
  return Math.min(99, Math.max(1, Math.round(100 * (1 - Math.exp(-score / SCALE)))));
}

export function pulseLevel(pulse: number): PulseLevel {
  if (pulse >= 70) return "high";
  if (pulse >= 40) return "rising";
  return "calm";
}

export const PULSE_LABEL: Record<PulseLevel, string> = {
  high: "Needs you now",
  rising: "Coming up",
  calm: "On track",
};
