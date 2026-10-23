// The "Rushd noticed this about you" layer: a short list of plain-language
// patterns from a student's study history. It reuses buildInsights() and
// only decides which numbers are real patterns rather than noise. The one
// new pattern here (session length vs. finishing) isn't in Insights.

import {
  buildInsights,
  type SessionRecord,
  type TimeOfDayInsight,
} from "@/lib/insights/build-insights";

export type PatternConfidence = "high" | "medium";

export interface Pattern {
  key: string;
  statement: string;
  confidence: PatternConfidence;
  sampleSize: number;
}

const MIN_SAMPLE_MEDIUM = 5;
const MIN_SAMPLE_HIGH = 10;
/** A gap between two groups smaller than this many percentage points is just noise. */
const MIN_NOTABLE_GAP_POINTS = 15;
const LONG_SESSION_MINUTES = 120;

function confidenceFor(sampleSize: number): PatternConfidence {
  return sampleSize >= MIN_SAMPLE_HIGH ? "high" : "medium";
}

function abandonRate(sessions: SessionRecord[]): number {
  const abandoned = sessions.filter((s) => s.status === "ABANDONED");
  return abandoned.length / sessions.length;
}

/** "1 PM" style label for an hour of the day (0-23). */
function hourLabel(hour: number): string {
  if (hour < 12) return `${hour} AM`;
  let hour12 = hour - 12;
  if (hour12 === 0) {
    hour12 = 12;
  }
  return `${hour12} PM`;
}

/** Do sessions planned for over 2 hours get abandoned more often? */
function sessionLengthPattern(sessions: SessionRecord[]): Pattern | null {
  const long = sessions.filter((s) => s.plannedMinutes > LONG_SESSION_MINUTES);
  const short = sessions.filter((s) => s.plannedMinutes <= LONG_SESSION_MINUTES);
  if (long.length < MIN_SAMPLE_MEDIUM || short.length < MIN_SAMPLE_MEDIUM) return null;

  const longAbandonRate = abandonRate(long);
  const shortAbandonRate = abandonRate(short);
  const gapPoints = (longAbandonRate - shortAbandonRate) * 100;
  if (gapPoints < MIN_NOTABLE_GAP_POINTS) return null;

  return {
    key: "session-length",
    statement: `You tend to abandon sessions longer than 2 hours — ${Math.round(longAbandonRate * 100)}% end early, vs ${Math.round(shortAbandonRate * 100)}% for shorter sessions.`,
    confidence: confidenceFor(long.length + short.length),
    sampleSize: long.length + short.length,
  };
}

/** Do sessions started before or after 6 PM get finished more often? */
function timeOfDayPattern(timeOfDay: TimeOfDayInsight): Pattern | null {
  const { beforeRate, afterRate, cutoffHour, beforeCount, afterCount } = timeOfDay;
  const gapPoints = Math.abs(beforeRate - afterRate) * 100;
  if (gapPoints < MIN_NOTABLE_GAP_POINTS) return null;

  let better: "before" | "after";
  let other: "before" | "after";
  let betterRate: number;
  let worseRate: number;
  if (beforeRate > afterRate) {
    better = "before";
    other = "after";
    betterRate = beforeRate;
    worseRate = afterRate;
  } else {
    better = "after";
    other = "before";
    betterRate = afterRate;
    worseRate = beforeRate;
  }
  const time = hourLabel(cutoffHour);

  let statement: string;
  if (worseRate > 0) {
    const percentMore = Math.round((betterRate / worseRate - 1) * 100);
    statement = `You complete ${percentMore}% more sessions when you start ${better} ${time}.`;
  } else {
    const percentDone = Math.round(betterRate * 100);
    statement = `You complete ${percentDone}% of sessions started ${better} ${time} — none started ${other} that time got finished.`;
  }

  return {
    key: "time-of-day",
    statement,
    confidence: confidenceFor(beforeCount + afterCount),
    sampleSize: beforeCount + afterCount,
  };
}

export function buildPatterns(sessions: SessionRecord[]): Pattern[] {
  const patterns: Pattern[] = [];
  const insights = buildInsights(sessions);

  if (insights.timeOfDay) {
    const pattern = timeOfDayPattern(insights.timeOfDay);
    if (pattern) patterns.push(pattern);
  }

  const lengthPattern = sessionLengthPattern(sessions);
  if (lengthPattern) patterns.push(lengthPattern);

  const hardestClass = insights.difficulty[0];
  if (hardestClass && hardestClass.harderShare >= 0.5) {
    patterns.push({
      key: "hardest-class",
      statement: `${hardestClass.className} is your toughest class right now — it feels harder than expected ${Math.round(hardestClass.harderShare * 100)}% of the time.`,
      confidence: confidenceFor(hardestClass.ratedCount),
      sampleSize: hardestClass.ratedCount,
    });
  }

  if (insights.busiestDay && insights.busiestDay.shareOfWeek >= 0.3) {
    patterns.push({
      key: "busiest-day",
      statement: `${insights.busiestDay.dayLabel} is consistently your busiest study day — ${Math.round(insights.busiestDay.shareOfWeek * 100)}% of your sessions start then.`,
      confidence: confidenceFor(insights.totalSessions),
      sampleSize: insights.totalSessions,
    });
  }

  return patterns;
}
