// Turns real StudySession history into a correction multiplier that the
// planner uses to adjust estimates. It's the same "average actual / planned"
// ratio Insights reports, applied forward. A minimum number of sessions is
// required so one fluke session never distorts a prediction.

import { averageTimeRatio, groupByClass, type SessionRecord } from "@/lib/insights/build-insights";

const MIN_SESSIONS_PER_CLASS = 3;
const MIN_SESSIONS_OVERALL = 3;
/** Smaller differences than this are noise; a 3% "adjustment" would only look falsely precise. */
const MIN_NOTABLE_DEVIATION = 0.1; // 10%
/** Never adjust an estimate by more than 2x either way, however extreme the history. */
const MAX_MULTIPLIER = 2.0;
const MIN_MULTIPLIER = 0.5;
/** An adjusted estimate is never below this; every real task takes some time. */
const MIN_ADJUSTED_MINUTES = 5;

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
    const ratio = averageTimeRatio(rated);
    if (Math.abs(ratio - 1) >= MIN_NOTABLE_DEVIATION) {
      overallMultiplier = clampMultiplier(ratio);
    }
  }

  const byClass: ClassEstimationProfile[] = [];
  for (const [className, classSessions] of groupByClass(rated)) {
    if (classSessions.length < MIN_SESSIONS_PER_CLASS) continue;
    const ratio = averageTimeRatio(classSessions);
    if (Math.abs(ratio - 1) < MIN_NOTABLE_DEVIATION) continue;
    const multiplier = clampMultiplier(ratio);
    byClass.push({
      className,
      multiplier,
      percentOff: Math.round((multiplier - 1) * 100),
      sampleSize: classSessions.length,
    });
  }
  // Classes whose estimates are furthest off come first.
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

function scaleMinutes(rawMinutes: number, multiplier: number): number {
  return Math.max(MIN_ADJUSTED_MINUTES, Math.round(rawMinutes * multiplier));
}

/** Applies the profile to one raw estimate. The class's own multiplier wins;
 * otherwise the student's overall one; otherwise the raw number is unchanged. */
export function adjustEstimate(
  rawMinutes: number,
  className: string,
  profile: EstimationProfile,
): AdjustedEstimate {
  const classProfile = profile.byClass.find((c) => c.className === className);
  if (classProfile) {
    return {
      minutes: scaleMinutes(rawMinutes, classProfile.multiplier),
      adjusted: true,
      multiplier: classProfile.multiplier,
      source: "class",
      percentOff: classProfile.percentOff,
    };
  }
  if (profile.overallMultiplier !== 1.0) {
    return {
      minutes: scaleMinutes(rawMinutes, profile.overallMultiplier),
      adjusted: true,
      multiplier: profile.overallMultiplier,
      source: "overall",
      percentOff: Math.round((profile.overallMultiplier - 1) * 100),
    };
  }
  return { minutes: rawMinutes, adjusted: false, multiplier: 1.0, source: "none", percentOff: 0 };
}
