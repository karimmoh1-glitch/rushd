// Pulse: how strongly an item needs you right now, from 1 to 99. It's just
// the priority score on a curve, so it always agrees with the plan order.
// The curve keeps the top end meaningful: overdue + high priority reads ~85,
// due today ~65, due next week ~20.

const SCALE = 110;

export type PulseLevel = "high" | "rising" | "calm";

export function pulseOf(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 1;

  const pulse = Math.round(100 * (1 - Math.exp(-score / SCALE)));
  if (pulse < 1) return 1;
  if (pulse > 99) return 99;
  return pulse;
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
