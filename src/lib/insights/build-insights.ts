// Turns raw StudySession rows into a handful of honest, specific
// observations about how a student actually studies — not projections,
// not AI guesses, just arithmetic over their own history. Every insight
// has a minimum-sample gate: below it, Rushd says so instead of reporting
// a number that would be noise dressed up as a pattern. See docs/PRODUCT.md
// for the "don't fabricate confidence" principle this follows.

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

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function buildInsights(sessions: SessionRecord[]): InsightsResult {
  const completed = sessions.filter((s) => s.status === "COMPLETED" && s.actualMinutes != null);

  const totalFocusedMinutes = completed.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
  const overallCompletionRate =
    sessions.length >= MIN_SESSIONS_PER_TIME_BUCKET
      ? sessions.filter((s) => s.status === "COMPLETED").length / sessions.length
      : null;

  // --- Estimate accuracy per class ---
  const byClass = new Map<string, { color: string; sessions: SessionRecord[] }>();
  for (const s of completed) {
    const entry = byClass.get(s.className) ?? { color: s.classColor, sessions: [] };
    entry.sessions.push(s);
    byClass.set(s.className, entry);
  }
  const estimateAccuracy: EstimateAccuracyInsight[] = [];
  for (const [className, { color, sessions: classSessions }] of byClass) {
    if (classSessions.length < MIN_SESSIONS_PER_CLASS) continue;
    const avgRatio =
      classSessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0) / s.plannedMinutes, 0) /
      classSessions.length;
    estimateAccuracy.push({
      className,
      classColor: color,
      sessionCount: classSessions.length,
      percentOff: Math.round((avgRatio - 1) * 100),
    });
  }
  estimateAccuracy.sort((a, b) => Math.abs(b.percentOff) - Math.abs(a.percentOff));

  // --- Completion rate by time of day (before/after 6pm local) ---
  const CUTOFF_HOUR = 18;
  const before = sessions.filter((s) => s.startedAt.getHours() < CUTOFF_HOUR);
  const after = sessions.filter((s) => s.startedAt.getHours() >= CUTOFF_HOUR);
  const timeOfDay: TimeOfDayInsight | null =
    before.length >= MIN_SESSIONS_PER_TIME_BUCKET && after.length >= MIN_SESSIONS_PER_TIME_BUCKET
      ? {
          cutoffHour: CUTOFF_HOUR,
          beforeRate: before.filter((s) => s.status === "COMPLETED").length / before.length,
          afterRate: after.filter((s) => s.status === "COMPLETED").length / after.length,
          beforeCount: before.length,
          afterCount: after.length,
        }
      : null;

  // --- Busiest day of week ---
  const dayCounts = new Array(7).fill(0);
  for (const s of sessions) dayCounts[s.startedAt.getDay()]++;
  const maxCount = Math.max(...dayCounts);
  const busiestDay: BusiestDayInsight | null =
    sessions.length >= MIN_SESSIONS_FOR_BUSIEST_DAY && maxCount > 0
      ? {
          dayLabel: DAY_LABELS[dayCounts.indexOf(maxCount)],
          sessionCount: maxCount,
          shareOfWeek: maxCount / sessions.length,
        }
      : null;

  // --- Perceived difficulty per class ---
  const difficultyByClass = new Map<string, { color: string; rated: SessionRecord[] }>();
  for (const s of completed) {
    if (!s.perceivedDifficulty) continue;
    const entry = difficultyByClass.get(s.className) ?? { color: s.classColor, rated: [] };
    entry.rated.push(s);
    difficultyByClass.set(s.className, entry);
  }
  const difficulty: DifficultyInsight[] = [];
  for (const [className, { color, rated }] of difficultyByClass) {
    if (rated.length < MIN_RATED_PER_CLASS) continue;
    const harderCount = rated.filter((s) => s.perceivedDifficulty === "HARDER").length;
    difficulty.push({
      className,
      classColor: color,
      harderShare: harderCount / rated.length,
      ratedCount: rated.length,
    });
  }
  difficulty.sort((a, b) => b.harderShare - a.harderShare);

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    totalFocusedMinutes,
    overallCompletionRate,
    estimateAccuracy,
    timeOfDay,
    busiestDay,
    difficulty,
  };
}
