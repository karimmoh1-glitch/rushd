// The "measurement -> better prediction" half of the loop documented in
// docs/PLANNING_ENGINE.md's "Future estimation architecture" section. Turns
// real StudySession history into a calibration multiplier the planning
// engine actually uses — not just a number shown on a dashboard. Same
// arithmetic as src/lib/insights/build-insights.ts's estimateAccuracy (this
// intentionally doesn't duplicate that computation's shape by accident;
// it's the same "avg(actual)/avg(planned)" ratio, applied forward instead
// of just reported backward), gated behind the same kind of minimum-sample
// floor so a single fluke session never distorts a real prediction.

import type { SessionRecord } from "@/lib/insights/build-insights";

const MIN_SESSIONS_PER_CLASS = 3;
const MIN_SESSIONS_OVERALL = 3;
/** A multiplier is only worth applying if it represents a real, consistent
 * pattern — below this it's noise, and forcing a 3% "adjustment" would just
 * make estimates look falsely precise. */
const MIN_NOTABLE_DEVIATION = 0.1; // 10%
/** Safety clamps: never adjust an estimate by more than 2x in either
 * direction, however extreme the historical ratio — a single very-overrun
 * class shouldn't be allowed to triple a prediction and break scheduling. */
const MAX_MULTIPLIER = 2.0;
const MIN_MULTIPLIER = 0.5;

export interface ClassEstimationProfile {
  className: string;
  multiplier: number;
  percentOff: number; // (multiplier - 1) * 100, for display — matches Insights' phrasing
  sampleSize: number;
}

export interface EstimationProfile {
  overallMultiplier: number; // 1.0 if there's no notable overall signal
  overallSampleSize: number;
  byClass: ClassEstimationProfile[];
}

function clampMultiplier(raw: number): number {
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, raw));
}

export function buildEstimationProfile(sessions: SessionRecord[]): EstimationProfile {
  const rated = sessions.filter((s) => s.status === "COMPLETED" && s.actualMinutes != null);

  let overallMultiplier = 1.0;
  if (rated.length >= MIN_SESSIONS_OVERALL) {
    const avgRatio =
      rated.reduce((sum, s) => sum + (s.actualMinutes ?? 0) / s.plannedMinutes, 0) / rated.length;
    if (Math.abs(avgRatio - 1) >= MIN_NOTABLE_DEVIATION) {
      overallMultiplier = clampMultiplier(avgRatio);
    }
  }

  const byClassSessions = new Map<string, SessionRecord[]>();
  for (const s of rated) {
    const list = byClassSessions.get(s.className) ?? [];
    list.push(s);
    byClassSessions.set(s.className, list);
  }

  const byClass: ClassEstimationProfile[] = [];
  for (const [className, classSessions] of byClassSessions) {
    if (classSessions.length < MIN_SESSIONS_PER_CLASS) continue;
    const avgRatio =
      classSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0) / s.plannedMinutes, 0) /
      classSessions.length;
    if (Math.abs(avgRatio - 1) < MIN_NOTABLE_DEVIATION) continue;
    const multiplier = clampMultiplier(avgRatio);
    byClass.push({
      className,
      multiplier,
      percentOff: Math.round((multiplier - 1) * 100),
      sampleSize: classSessions.length,
    });
  }
  byClass.sort((a, b) => Math.abs(b.percentOff) - Math.abs(a.percentOff));

  return {
    overallMultiplier,
    overallSampleSize: rated.length,
    byClass,
  };
}

export interface AdjustedEstimate {
  minutes: number;
  adjusted: boolean;
  multiplier: number;
  source: "class" | "overall" | "none";
  percentOff: number;
}

/** Applies a student's estimation profile to one raw estimate. Class-level
 * calibration wins when there's enough class-specific data; otherwise falls
 * back to the student's overall pattern; otherwise the raw number stands
 * completely unchanged. Always rounds to the nearest minute and never
 * returns something below 5 minutes (a real task always takes some
 * non-trivial time). */
export function adjustEstimate(
  rawMinutes: number,
  className: string,
  profile: EstimationProfile,
): AdjustedEstimate {
  const classProfile = profile.byClass.find((c) => c.className === className);
  if (classProfile) {
    return {
      minutes: Math.max(5, Math.round(rawMinutes * classProfile.multiplier)),
      adjusted: true,
      multiplier: classProfile.multiplier,
      source: "class",
      percentOff: classProfile.percentOff,
    };
  }
  if (profile.overallMultiplier !== 1.0) {
    return {
      minutes: Math.max(5, Math.round(rawMinutes * profile.overallMultiplier)),
      adjusted: true,
      multiplier: profile.overallMultiplier,
      source: "overall",
      percentOff: Math.round((profile.overallMultiplier - 1) * 100),
    };
  }
  return { minutes: rawMinutes, adjusted: false, multiplier: 1.0, source: "none", percentOff: 0 };
}
