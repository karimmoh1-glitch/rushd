// A single, explainable number summarizing how a student's actual work is
// going — not a gamified streak counter. Every component is arithmetic over
// data the student already generated (StudySession, Assignment), the same
// "the real reason is already known exactly" principle as
// src/lib/planning/explain.ts. No AI, no fabrication: a component that
// doesn't have enough data to be honest is simply left out and the overall
// weight redistributes across what's actually known, rather than guessing.

import type { SessionRecord } from "@/lib/insights/build-insights";

export interface RecentAssignmentRecord {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

export interface HealthComponent {
  key: "completion" | "accuracy" | "overdue" | "followThrough";
  label: string;
  score: number; // 0-100
  weight: number; // renormalized share of the final score, 0-1
  detail: string;
}

export interface HealthScoreResult {
  score: number | null; // null = not enough data across every component
  components: HealthComponent[];
}

const MIN_SESSIONS_FOR_COMPLETION = 3;
const MIN_SESSIONS_FOR_ACCURACY = 3;
const MIN_RECENT_ASSIGNMENTS_FOR_FOLLOW_THROUGH = 3;

const BASE_WEIGHTS: Record<HealthComponent["key"], number> = {
  completion: 0.3,
  accuracy: 0.25,
  overdue: 0.25,
  followThrough: 0.2,
};

export function buildHealthScore(input: {
  sessions: SessionRecord[];
  recentAssignments: RecentAssignmentRecord[]; // due in the last ~14 days
  overdueCount: number;
  openCount: number; // currently open (not completed) assignments, overdue or not
}): HealthScoreResult {
  const components: HealthComponent[] = [];

  // --- Completion: of sessions you started, how many did you finish? ---
  if (input.sessions.length >= MIN_SESSIONS_FOR_COMPLETION) {
    const completed = input.sessions.filter((s) => s.status === "COMPLETED").length;
    const rate = completed / input.sessions.length;
    components.push({
      key: "completion",
      label: "Session completion",
      score: Math.round(rate * 100),
      weight: BASE_WEIGHTS.completion,
      detail: `You complete ${Math.round(rate * 100)}% of the study sessions you start.`,
    });
  }

  // --- Accuracy: how close is actual time to what was planned? ---
  const rated = input.sessions.filter((s) => s.status === "COMPLETED" && s.actualMinutes != null);
  if (rated.length >= MIN_SESSIONS_FOR_ACCURACY) {
    const avgRatio =
      rated.reduce((sum, s) => sum + (s.actualMinutes ?? 0) / s.plannedMinutes, 0) / rated.length;
    const percentOff = Math.round((avgRatio - 1) * 100);
    const absOff = Math.abs(percentOff);
    const score = Math.max(0, 100 - absOff);
    const detail =
      absOff <= 10
        ? `Your time estimates are accurate — usually within ${absOff}%.`
        : percentOff > 0
          ? `You underestimate how long work takes by about ${absOff}%, on average.`
          : `You typically finish faster than planned, by about ${absOff}%.`;
    components.push({
      key: "accuracy",
      label: "Estimate accuracy",
      score,
      weight: BASE_WEIGHTS.accuracy,
      detail,
    });
  }

  // --- Overdue control: how much of your open work is overdue right now? ---
  const overdueRatio = input.openCount > 0 ? input.overdueCount / input.openCount : 0;
  components.push({
    key: "overdue",
    label: "Overdue control",
    score: Math.round(Math.max(0, 100 - overdueRatio * 100)),
    weight: BASE_WEIGHTS.overdue,
    detail:
      input.openCount === 0
        ? "Nothing open right now — fully caught up."
        : input.overdueCount === 0
          ? `None of your ${input.openCount} open assignments are overdue.`
          : `${input.overdueCount} of your ${input.openCount} open assignments ${input.overdueCount === 1 ? "is" : "are"} overdue.`,
  });

  // --- Follow-through: of work due in the last two weeks, how much got done? ---
  if (input.recentAssignments.length >= MIN_RECENT_ASSIGNMENTS_FOR_FOLLOW_THROUGH) {
    const done = input.recentAssignments.filter((a) => a.status === "COMPLETED").length;
    const rate = done / input.recentAssignments.length;
    components.push({
      key: "followThrough",
      label: "Follow-through",
      score: Math.round(rate * 100),
      weight: BASE_WEIGHTS.followThrough,
      detail: `${Math.round(rate * 100)}% of work due in the last two weeks got marked done.`,
    });
  }

  if (components.length === 0) {
    return { score: null, components: [] };
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const normalized = components.map((c) => ({ ...c, weight: c.weight / totalWeight }));
  const score = Math.round(normalized.reduce((sum, c) => sum + c.score * c.weight, 0));

  return { score, components: normalized };
}
