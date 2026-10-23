// Turns a student's StudySession rows into a few honest observations about
// how they study: plain arithmetic over their own history. Every insight
// needs a minimum number of sessions; below that we report nothing rather
// than a number that is just noise (see docs/PRODUCT.md).

export interface SessionRecord {
  className: string;
  classColor: string;
  status: "COMPLETED" | "ABANDONED";
  plannedMinutes: number;
  actualMinutes: number | null;
  perceivedDifficulty: "EASIER" | "AS_EXPECTED" | "HARDER" | null;
  startedAt: Date;
}

export interface EstimateAccuracyInsight {
  className: string;
  classColor: string;
  sessionCount: number;
  /** Positive = sessions run longer than planned, on average, by this % */
  percentOff: number;
}

export interface TimeOfDayInsight {
  cutoffHour: number; // e.g. 18 for 6pm
  beforeRate: number; // 0-1
  afterRate: number; // 0-1
  beforeCount: number;
  afterCount: number;
}

export interface BusiestDayInsight {
  dayLabel: string;
  sessionCount: number;
  shareOfWeek: number; // 0-1, this day's share of all sessions
}

export interface DifficultyInsight {
  className: string;
  classColor: string;
  harderShare: number; // 0-1 of rated sessions marked HARDER
  ratedCount: number;
}

export interface InsightsResult {
  totalSessions: number;
  completedSessions: number;
  totalFocusedMinutes: number;
  overallCompletionRate: number | null; // null if not enough data
  estimateAccuracy: EstimateAccuracyInsight[];
  timeOfDay: TimeOfDayInsight | null;
  busiestDay: BusiestDayInsight | null;
  difficulty: DifficultyInsight[];
}

const MIN_SESSIONS_PER_CLASS = 2;
const MIN_SESSIONS_PER_TIME_BUCKET = 3;
const MIN_SESSIONS_FOR_BUSIEST_DAY = 4;
const MIN_RATED_PER_CLASS = 2;
/** Sessions starting before this hour (local time) count as "before 6 PM". */
const CUTOFF_HOUR = 18;

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The average of actual / planned minutes. 1.0 means estimates were spot on. */
export function averageTimeRatio(sessions: SessionRecord[]): number {
  let total = 0;
  for (const session of sessions) {
    total += (session.actualMinutes ?? 0) / session.plannedMinutes;
  }
  return total / sessions.length;
}

/** Groups sessions by class name, keeping the order classes first appear in. */
export function groupByClass(sessions: SessionRecord[]): Map<string, SessionRecord[]> {
  const groups = new Map<string, SessionRecord[]>();
  for (const session of sessions) {
    const group = groups.get(session.className);
    if (group) {
      group.push(session);
    } else {
      groups.set(session.className, [session]);
    }
  }
  return groups;
}

function countCompleted(sessions: SessionRecord[]): number {
  let count = 0;
  for (const session of sessions) {
    if (session.status === "COMPLETED") count++;
  }
  return count;
}

function buildEstimateAccuracy(completed: SessionRecord[]): EstimateAccuracyInsight[] {
  const result: EstimateAccuracyInsight[] = [];
  for (const [className, classSessions] of groupByClass(completed)) {
    if (classSessions.length < MIN_SESSIONS_PER_CLASS) continue;
    const ratio = averageTimeRatio(classSessions);
    result.push({
      className,
      classColor: classSessions[0].classColor,
      sessionCount: classSessions.length,
      percentOff: Math.round((ratio - 1) * 100),
    });
  }
  // Classes whose estimates are furthest off come first.
  result.sort((a, b) => Math.abs(b.percentOff) - Math.abs(a.percentOff));
  return result;
}

/** Completion rate for sessions started before vs. after 6 PM. */
function buildTimeOfDay(sessions: SessionRecord[]): TimeOfDayInsight | null {
  const before = sessions.filter((s) => s.startedAt.getHours() < CUTOFF_HOUR);
  const after = sessions.filter((s) => s.startedAt.getHours() >= CUTOFF_HOUR);
  if (before.length < MIN_SESSIONS_PER_TIME_BUCKET || after.length < MIN_SESSIONS_PER_TIME_BUCKET) {
    return null;
  }
  return {
    cutoffHour: CUTOFF_HOUR,
    beforeRate: countCompleted(before) / before.length,
    afterRate: countCompleted(after) / after.length,
    beforeCount: before.length,
    afterCount: after.length,
  };
}

function buildBusiestDay(sessions: SessionRecord[]): BusiestDayInsight | null {
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const session of sessions) {
    dayCounts[session.startedAt.getDay()]++;
  }

  // Find the day with the most sessions (the earliest day wins a tie).
  let busiestIndex = 0;
  for (let day = 1; day < 7; day++) {
    if (dayCounts[day] > dayCounts[busiestIndex]) busiestIndex = day;
  }
  const maxCount = dayCounts[busiestIndex];

  if (sessions.length < MIN_SESSIONS_FOR_BUSIEST_DAY || maxCount <= 0) return null;
  return {
    dayLabel: DAY_LABELS[busiestIndex],
    sessionCount: maxCount,
    shareOfWeek: maxCount / sessions.length,
  };
}

/** For each class, how often rated sessions felt harder than expected. */
function buildDifficulty(completed: SessionRecord[]): DifficultyInsight[] {
  const rated = completed.filter((s) => s.perceivedDifficulty);
  const result: DifficultyInsight[] = [];
  for (const [className, classRated] of groupByClass(rated)) {
    if (classRated.length < MIN_RATED_PER_CLASS) continue;
    const harderCount = classRated.filter((s) => s.perceivedDifficulty === "HARDER").length;
    result.push({
      className,
      classColor: classRated[0].classColor,
      harderShare: harderCount / classRated.length,
      ratedCount: classRated.length,
    });
  }
  result.sort((a, b) => b.harderShare - a.harderShare);
  return result;
}

export function buildInsights(sessions: SessionRecord[]): InsightsResult {
  const completed = sessions.filter((s) => s.status === "COMPLETED" && s.actualMinutes != null);

  let totalFocusedMinutes = 0;
  for (const session of completed) {
    totalFocusedMinutes += session.actualMinutes ?? 0;
  }

  let overallCompletionRate: number | null = null;
  if (sessions.length >= MIN_SESSIONS_PER_TIME_BUCKET) {
    overallCompletionRate = countCompleted(sessions) / sessions.length;
  }

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    totalFocusedMinutes,
    overallCompletionRate,
    estimateAccuracy: buildEstimateAccuracy(completed),
    timeOfDay: buildTimeOfDay(sessions),
    busiestDay: buildBusiestDay(sessions),
    difficulty: buildDifficulty(completed),
  };
}
