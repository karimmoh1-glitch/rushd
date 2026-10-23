// The Today page's outcome answers, from real data only: "Am I ready for my
// next assessment?", "What is my biggest learning gap?" and "Is any course
// finished?". Pure and unit-tested (outcomes.test.ts). Every answer may be
// "not enough evidence"; none of them invents a number.

import type { Remediation } from "@/lib/learning/graph";
import type { EstimateConfidence, TopicEstimate } from "@/lib/learning/estimator";
import { diffDateKeys } from "@/lib/time/zone";
import { formatDuration } from "@/lib/format";
import { summarizeMastery } from "./mastery-inputs";
import type { MasterySummary } from "./types";

// ---------------------------------------------------------------------------
// Readiness for the next exam
// ---------------------------------------------------------------------------

export type ReadinessLevel = "no_topics" | "not_enough_evidence" | "at_risk" | "getting_there" | "on_track";

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  no_topics: "Can't tell yet",
  not_enough_evidence: "Not enough evidence",
  at_risk: "At risk",
  getting_there: "Getting there",
  on_track: "Looks on track",
};

export interface ReadinessTopic {
  id: string;
  title: string;
  estimate: TopicEstimate;
}

export interface ReadinessInput {
  className: string;
  /** Calendar days until the exam (0 = today). */
  daysLeft: number;
  topics: ReadinessTopic[];
  /** Prep minutes the plan has placed before the exam. */
  plannedPrepMinutes: number;
  /** Prep minutes the planner thinks the exam needs (mastery-adjusted). */
  neededPrepMinutes: number;
  /** Prep minutes that don't fit before the exam. */
  shortMinutes: number;
}

export interface Readiness {
  level: ReadinessLevel;
  label: string;
  counts: MasterySummary;
  practiced: number;
  /** How sure the estimate is. Null when there's nothing to be sure about. */
  confidence: EstimateConfidence | null;
  summary: string;
  /** What would raise confidence or readiness, most useful first. */
  improve: string[];
}

/** Fewer than half the topics practiced, or under two judged topics: too little to say. */
const MIN_COVERAGE = 0.5;
const AT_RISK_NEEDS_REVIEW_SHARE = 1 / 3;
const ON_TRACK_SECURE_SHARE = 0.6;

function listTitles(titles: string[], max = 2): string {
  const shown = titles.slice(0, max);
  const rest = titles.length - shown.length;
  if (shown.length === 0) return "";
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`;
  return shown[0];
}

const CONFIDENCE_RANK: Record<EstimateConfidence, number> = { low: 0, medium: 1, high: 2 };

export function assessReadiness(input: ReadinessInput): Readiness {
  const counts = summarizeMastery(input.topics.map((t) => t.estimate.status));
  const practicedTopics = input.topics.filter((t) => t.estimate.answers > 0);
  const practiced = practicedTopics.length;
  const unpracticed = input.topics.filter((t) => t.estimate.answers === 0).map((t) => t.title);
  const needsReview = input.topics.filter((t) => t.estimate.status === "needs_review").map((t) => t.title);
  const judged = counts.total - counts.unknown;
  const improve: string[] = [];

  if (counts.total === 0) {
    return {
      level: "no_topics",
      label: READINESS_LABEL.no_topics,
      counts,
      practiced: 0,
      confidence: null,
      summary: `${input.className} has no topics yet, so Rushd can't judge readiness.`,
      improve: [`Add the topics this exam covers to ${input.className}, then practice them.`],
    };
  }

  if (unpracticed.length > 0) improve.push(`Practice ${listTitles(unpracticed)}: no answers yet.`);
  if (needsReview.length > 0) improve.push(`Review ${listTitles(needsReview)}.`);
  if (input.shortMinutes > 0) {
    improve.push(`Find ${formatDuration(input.shortMinutes)} more for prep before the exam, or move lighter work.`);
  }
  const singleSitting = practicedTopics.some((t) => t.estimate.sessions < 2);
  if (singleSitting) improve.push("Answer again on a different day: one sitting can't confirm a topic.");

  if (practiced / counts.total < MIN_COVERAGE || judged < 2) {
    return {
      level: "not_enough_evidence",
      label: READINESS_LABEL.not_enough_evidence,
      counts,
      practiced,
      confidence: null,
      summary: `You've practiced ${practiced} of ${counts.total} ${counts.total === 1 ? "topic" : "topics"}; that's too little to say how ready you are.`,
      improve,
    };
  }

  // Confidence: the weakest confidence among practiced topics, and never
  // above medium while some topics have no evidence at all.
  let confidence: EstimateConfidence = "high";
  for (const topic of practicedTopics) {
    if (CONFIDENCE_RANK[topic.estimate.confidence] < CONFIDENCE_RANK[confidence]) confidence = topic.estimate.confidence;
  }
  if (unpracticed.length > 0 && confidence === "high") confidence = "medium";

  let level: ReadinessLevel;
  if (
    counts.needsReview / counts.total >= AT_RISK_NEEDS_REVIEW_SHARE ||
    input.shortMinutes > 0 ||
    (input.daysLeft <= 2 && counts.needsReview > 0)
  ) {
    level = "at_risk";
  } else if (counts.secure / counts.total >= ON_TRACK_SECURE_SHARE && counts.needsReview === 0) {
    level = "on_track";
  } else {
    level = "getting_there";
  }

  const parts: string[] = [];
  if (counts.secure > 0) parts.push(`${counts.secure} secure`);
  if (counts.developing > 0) parts.push(`${counts.developing} developing`);
  if (counts.needsReview > 0) parts.push(`${counts.needsReview} need${counts.needsReview === 1 ? "s" : ""} review`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} not enough evidence`);
  const prep =
    input.neededPrepMinutes > 0
      ? ` ${formatDuration(input.plannedPrepMinutes)} of ${formatDuration(input.neededPrepMinutes)} prep is planned.`
      : "";
  return {
    level,
    label: READINESS_LABEL[level],
    counts,
    practiced,
    confidence,
    summary: `Of ${counts.total} ${counts.total === 1 ? "topic" : "topics"}: ${parts.join(", ")}.${prep}`,
    improve,
  };
}

// ---------------------------------------------------------------------------
// Biggest learning gap
// ---------------------------------------------------------------------------

export interface GapCandidate {
  topicId: string;
  title: string;
  classId: string;
  className: string;
  classColor: string;
  estimate: TopicEstimate;
  remediation: Remediation | null;
}

export interface LearningGap extends GapCandidate {
  /** Days until the course's next exam, when there is one. */
  examDays: number | null;
  /** Why this one: the estimator's own sentence plus the exam context. */
  reason: string;
}

function weakness(e: TopicEstimate): number {
  if (e.status === "needs_review") return 3;
  if (e.status === "developing") return e.estimate !== null && e.estimate < 70 ? 2 : 1;
  return 0;
}

function soonness(examDays: number | null, due: boolean): number {
  let points = 0;
  if (examDays !== null) {
    if (examDays <= 7) points = 3;
    else if (examDays <= 14) points = 2;
    else if (examDays <= 30) points = 1;
  }
  if (due) points += 1;
  return points;
}

/**
 * The weakest topic that matters soonest: weakness (needs review, then
 * developing under 70%, then developing) plus how soon it matters (an exam in
 * its course within 7/14/30 days, or a review that's due). Only topics with
 * evidence count; "never practiced" isn't a demonstrated gap.
 */
export function pickBiggestGap(candidates: GapCandidate[], examDaysByClass: Map<string, number>): LearningGap | null {
  const ranked = candidates
    .filter((c) => c.estimate.answers > 0 && weakness(c.estimate) > 0)
    .map((c) => {
      const examDays = examDaysByClass.get(c.classId) ?? null;
      return { c, examDays, key: weakness(c.estimate) + soonness(examDays, c.estimate.due) };
    })
    .sort(
      (a, b) =>
        b.key - a.key ||
        (a.c.estimate.estimate ?? 101) - (b.c.estimate.estimate ?? 101) ||
        (a.examDays ?? 999) - (b.examDays ?? 999) ||
        a.c.title.localeCompare(b.c.title),
    );
  const top = ranked[0];
  if (!top) return null;
  const exam =
    top.examDays === null
      ? ""
      : top.examDays === 0
        ? ` ${top.c.className} has an exam today.`
        : ` ${top.c.className} has an exam in ${top.examDays} ${top.examDays === 1 ? "day" : "days"}.`;
  return { ...top.c, examDays: top.examDays, reason: `${top.c.estimate.explanation}${exam}` };
}

// ---------------------------------------------------------------------------
// Term end: "Archive this course?"
// ---------------------------------------------------------------------------

export interface TermCourse {
  id: string;
  name: string;
  archived: boolean;
  /** Local date key of the last day of term, or null when not set. */
  termEnd: string | null;
  archiveSuggestionDismissedAt: Date | null;
}

/** Courses whose term has ended and that the student hasn't archived or
 * waved off. Rushd only asks; it never archives on its own. */
export function coursesToSuggestArchiving(courses: TermCourse[], today: string): TermCourse[] {
  return courses.filter(
    (c) => !c.archived && c.termEnd !== null && diffDateKeys(c.termEnd, today) > 0 && c.archiveSuggestionDismissedAt === null,
  );
}

/** A @db.Date column comes back as UTC midnight; its calendar day is the key. */
export function dateColumnKey(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}
