// Turns a student's StudySession history into a short list of confident,
// plain-language patterns — the "Rushd noticed this about you" layer.
// Deliberately built on top of buildInsights() rather than reimplementing
// its math: this module's job is picking which of those numbers are
// actually *patterns* worth stating with confidence (vs. noise), not
// recomputing them. One genuinely new pattern lives here (session length
// vs. completion) because Insights doesn't already compute it.

import { buildInsights, type SessionRecord } from "@/lib/insights/build-insights";

export type PatternConfidence = "high" | "medium";

export interface Pattern {
  key: string;
  statement: string;
  confidence: PatternConfidence;
  sampleSize: number;
}

const MIN_SAMPLE_MEDIUM = 5;
const MIN_SAMPLE_HIGH = 10;
/** Below this percentage-point gap between two groups, a difference is
 * within normal noise, not a real behavioral pattern. */
const MIN_NOTABLE_GAP_POINTS = 15;

function confidenceFor(sampleSize: number): PatternConfidence {
  return sampleSize >= MIN_SAMPLE_HIGH ? "high" : "medium";
}

/** Session-length vs. completion: do longer sessions get abandoned more
 * often? Not computed anywhere else — genuinely new signal. */
function sessionLengthPattern(sessions: SessionRecord[]): Pattern | null {
  const LONG_THRESHOLD_MINUTES = 120;
  const long = sessions.filter((s) => s.plannedMinutes > LONG_THRESHOLD_MINUTES);
  const short = sessions.filter((s) => s.plannedMinutes <= LONG_THRESHOLD_MINUTES);
  if (long.length < MIN_SAMPLE_MEDIUM || short.length < MIN_SAMPLE_MEDIUM) return null;

  const abandonRate = (group: SessionRecord[]) =>
    group.filter((s) => s.status === "ABANDONED").length / group.length;
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

export function buildPatterns(sessions: SessionRecord[]): Pattern[] {
  const patterns: Pattern[] = [];
  const insights = buildInsights(sessions);

  if (insights.timeOfDay) {
    const { beforeRate, afterRate, cutoffHour, beforeCount, afterCount } = insights.timeOfDay;
    const gapPoints = Math.abs(beforeRate - afterRate) * 100;
    if (gapPoints >= MIN_NOTABLE_GAP_POINTS) {
      const better = beforeRate > afterRate ? "before" : "after";
      const betterRate = better === "before" ? beforeRate : afterRate;
      const worseRate = better === "before" ? afterRate : beforeRate;
      const period = cutoffHour >= 12 ? `${cutoffHour - 12 || 12} PM` : `${cutoffHour} AM`;
      patterns.push({
        key: "time-of-day",
        statement:
          worseRate > 0
            ? `You complete ${Math.round((betterRate / worseRate - 1) * 100)}% more sessions when you start ${better} ${period}.`
            : `You complete ${Math.round(betterRate * 100)}% of sessions started ${better} ${period} — none started ${better === "before" ? "after" : "before"} that time got finished.`,
        confidence: confidenceFor(beforeCount + afterCount),
        sampleSize: beforeCount + afterCount,
      });
    }
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
