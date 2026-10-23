// Mastery estimator v2: pure and deterministic. The same evidence and the same
// "now" always give the same answer. The model and its limits are written up
// in docs/MASTERY.md; keep the two in sync.
//
// What it uses, per topic:
// - accuracy, weighted by question difficulty and recency (half-life ~30 days)
// - hint use: answers that needed hints earn less credit, and 2+ hints never
//   count as a clean recall
// - separate sessions: success on different occasions counts; many answers in
//   one sitting add evidence with diminishing returns (massed practice)
// - time since the last successful recall, through the review schedule
//   (expanding intervals; failures shorten them)
// - repeated mistakes on the same question
// - self-reported confidence against results (over/underconfidence)
// One correct answer can never make a topic "secure".

import { bandFor } from "@/lib/practice/mastery";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type MasteryStatusV2 = "secure" | "developing" | "needs_review" | "not_enough_evidence";
export type EstimateConfidence = "low" | "medium" | "high";
export type Calibration = "overconfident" | "underconfident" | "matched" | null;

/** One piece of evidence for one topic. */
export interface Observation {
  at: Date;
  /** Credit for the answer, 0-1: correct 1, partial 0.5, incorrect 0. A photo check passes its overall score. */
  score: number;
  /** How many answers this stands for: 1 for one practice question, the gradable items for a photo check. */
  items: number;
  /** 1 easier, 2 standard, 3 harder. Unknown counts as standard. */
  difficulty?: number | null;
  hintsUsed?: number | null;
  /** Self-reported before the reveal: 1 unsure, 2 fairly sure, 3 sure. */
  confidence?: number | null;
  /** Practice session id, or "assessment:<id>" for a photo check. */
  sessionKey: string;
  questionId?: string | null;
}

export interface TopicEstimate {
  status: MasteryStatusV2;
  /** 0-100 recency- and difficulty-weighted accuracy, hint-adjusted. Null without evidence. */
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: EstimateConfidence;
  answers: number;
  correct: number;
  /** Separate study occasions (sessions more than ~20 hours apart). */
  sessions: number;
  /** Occasions where the student recalled it cleanly. */
  successSessions: number;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  /** When to check it again. Null without evidence. */
  nextReviewAt: Date | null;
  intervalDays: number | null;
  due: boolean;
  overdueDays: number;
  /** Questions missed more than once. */
  repeatedMistakes: number;
  heavyHints: boolean;
  calibration: Calibration;
  /** Plain-language summary of the evidence and what it means. */
  explanation: string;
  /** What evidence would make the estimate more reliable or move it. */
  improve: string[];
}

/** Review intervals in days, after 1, 2, 3, ... spaced successful recalls. */
export const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;
const HALF_LIFE_DAYS = 30;
/** Sessions that start within this many hours of each other are one occasion. */
const SEPARATE_SESSION_HOURS = 20;
const DIFFICULTY_WEIGHT: Record<number, number> = { 1: 0.75, 2: 1, 3: 1.25 };

function hintFactor(hints: number): number {
  if (hints <= 0) return 1;
  if (hints === 1) return 0.8;
  if (hints === 2) return 0.6;
  return 0.4;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function difficultyWeight(d: number | null | undefined): number {
  return DIFFICULTY_WEIGHT[d ?? 2] ?? 1;
}

/** Credit after the hint penalty. */
function credit(o: Observation): number {
  return clamp01(o.score) * hintFactor(o.hintsUsed ?? 0);
}

/** A correct answer with at most one hint (or a photo check scoring 80%+). */
function isCleanSuccess(o: Observation): boolean {
  return o.score >= (o.items > 1 ? 0.8 : 1) && (o.hintsUsed ?? 0) <= 1;
}

interface Occasion {
  start: Date;
  end: Date;
  observations: Observation[];
}

/** Groups evidence by session, then merges sessions that start close together. */
function occasionsOf(sorted: Observation[]): Occasion[] {
  const bySession = new Map<string, Observation[]>();
  for (const o of sorted) {
    const list = bySession.get(o.sessionKey);
    if (list) list.push(o);
    else bySession.set(o.sessionKey, [o]);
  }
  const sessions = [...bySession.values()].sort((a, b) => a[0].at.getTime() - b[0].at.getTime());
  const occasions: Occasion[] = [];
  for (const list of sessions) {
    const start = list[0].at;
    const end = list[list.length - 1].at;
    const last = occasions[occasions.length - 1];
    if (last && start.getTime() - last.start.getTime() < SEPARATE_SESSION_HOURS * 3_600_000) {
      last.observations.push(...list);
      if (end > last.end) last.end = end;
    } else {
      occasions.push({ start, end, observations: [...list] });
    }
  }
  return occasions;
}

function occasionAccuracy(occasion: Occasion): number {
  let weight = 0;
  let earned = 0;
  for (const o of occasion.observations) {
    const w = o.items * difficultyWeight(o.difficulty);
    weight += w;
    earned += w * credit(o);
  }
  return weight > 0 ? earned / weight : 0;
}

interface Schedule {
  step: number; // -1 = no successful recall yet
  lastOccasionEnd: Date;
  lastSuccessAt: Date | null;
  successSessions: number;
}

/** Walks the occasions in order: spaced success lengthens the interval, massed
 * success doesn't, failure shortens it. */
function schedule(occasions: Occasion[]): Schedule {
  let step = -1;
  let lastSuccessOccasion: Date | null = null;
  let lastSuccessAt: Date | null = null;
  let successSessions = 0;
  for (const occasion of occasions) {
    const accuracy = occasionAccuracy(occasion);
    const hadClean = occasion.observations.some(isCleanSuccess);
    if (accuracy >= 0.8 && hadClean) {
      successSessions += 1;
      if (step === -1) {
        step = 0;
      } else if (lastSuccessOccasion) {
        const gapDays = (occasion.start.getTime() - lastSuccessOccasion.getTime()) / DAY_MS;
        if (gapDays >= INTERVALS_DAYS[step] * 0.5) step = Math.min(step + 1, INTERVALS_DAYS.length - 1);
      }
      lastSuccessOccasion = occasion.end;
    } else if (accuracy < 0.5) {
      step = step <= 0 ? step : Math.max(0, step - 2);
    }
    for (const o of occasion.observations) {
      if (isCleanSuccess(o) && (!lastSuccessAt || o.at > lastSuccessAt)) lastSuccessAt = o.at;
    }
  }
  return { step, lastOccasionEnd: occasions[occasions.length - 1].end, lastSuccessAt, successSessions };
}

function calibrationOf(observations: Observation[]): Calibration {
  let reported = 0;
  let sure = 0;
  let sureWrong = 0;
  let unsure = 0;
  let unsureRight = 0;
  for (const o of observations) {
    if (o.confidence == null) continue;
    reported += 1;
    if (o.confidence >= 3) {
      sure += 1;
      if (o.score === 0) sureWrong += 1;
    } else if (o.confidence <= 1) {
      unsure += 1;
      if (o.score >= 1 && (o.hintsUsed ?? 0) === 0) unsureRight += 1;
    }
  }
  if (sureWrong >= 2 && sureWrong / sure >= 0.34) return "overconfident";
  if (unsureRight >= 3 && unsureRight / unsure >= 0.75) return "underconfident";
  if (reported >= 3) return "matched";
  return null;
}

function repeatedMistakesOf(observations: Observation[]): number {
  const misses = new Map<string, number>();
  for (const o of observations) {
    if (!o.questionId || o.score >= 1) continue;
    misses.set(o.questionId, (misses.get(o.questionId) ?? 0) + 1);
  }
  let repeated = 0;
  for (const count of misses.values()) if (count >= 2) repeated += 1;
  return repeated;
}

/** "today", "yesterday", "9 days ago". */
export function daysAgoPhrase(days: number): string {
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${Math.floor(days)} days ago`;
}

/** "today", "tomorrow", "in 3 days", "next week", "in about 3 weeks". */
export function inDaysPhrase(days: number): string {
  if (days <= 0) return "now";
  if (days < 1.5) return "tomorrow";
  if (days < 7) return `in ${Math.round(days)} days`;
  if (days < 14) return "next week";
  return `in about ${Math.round(days / 7)} weeks`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function confidenceFor(effective: number, occasions: number, daysSinceLast: number): EstimateConfidence {
  let level: EstimateConfidence = "medium";
  if (effective < 3 || occasions < 2) level = "low";
  else if (effective >= 6 && occasions >= 3) level = "high";
  // Old evidence says less about today.
  if (daysSinceLast > 60) level = level === "high" ? "medium" : "low";
  return level;
}

const EMPTY: TopicEstimate = {
  status: "not_enough_evidence",
  estimate: null,
  low: null,
  high: null,
  confidence: "low",
  answers: 0,
  correct: 0,
  sessions: 0,
  successSessions: 0,
  lastAttemptAt: null,
  lastSuccessAt: null,
  nextReviewAt: null,
  intervalDays: null,
  due: false,
  overdueDays: 0,
  repeatedMistakes: 0,
  heavyHints: false,
  calibration: null,
  explanation: "No practice yet, so there's nothing to estimate.",
  improve: ["Answer two or three questions on this topic, then come back on another day."],
};

/** The estimate for one topic from all of its evidence. */
export function estimateTopic(input: Observation[], now: Date): TopicEstimate {
  const observations = input
    .filter((o) => Number.isFinite(o.score) && o.items > 0 && o.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (observations.length === 0) return { ...EMPTY, improve: [...EMPTY.improve] };

  // Accuracy: difficulty- and recency-weighted, after the hint penalty.
  let weight = 0;
  let earned = 0;
  let answers = 0;
  let correct = 0;
  let practiceAnswers = 0;
  let heavyHintAnswers = 0;
  for (const o of observations) {
    const ageDays = Math.max(0, (now.getTime() - o.at.getTime()) / DAY_MS);
    const w = o.items * difficultyWeight(o.difficulty) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    weight += w;
    earned += w * credit(o);
    answers += o.items;
    correct += o.items > 1 ? Math.round(clamp01(o.score) * o.items) : o.score >= 1 ? 1 : 0;
    if (o.items === 1) {
      practiceAnswers += 1;
      if ((o.hintsUsed ?? 0) >= 2) heavyHintAnswers += 1;
    }
  }
  const accuracy = weight > 0 ? earned / weight : 0;

  const occasions = occasionsOf(observations);
  // Massed answers count with diminishing returns: 1, 2, 4, 8 answers in one sitting ≈ 1, 2, 3, 4.
  let effective = 0;
  for (const occasion of occasions) {
    let items = 0;
    for (const o of occasion.observations) items += o.items;
    effective += 1 + Math.log2(items);
  }

  const plan = schedule(occasions);
  const intervalDays = INTERVALS_DAYS[Math.max(0, plan.step)];
  const nextReviewAt = new Date(plan.lastOccasionEnd.getTime() + intervalDays * DAY_MS);
  const due = now.getTime() >= nextReviewAt.getTime();
  const overdueDays = due ? (now.getTime() - nextReviewAt.getTime()) / DAY_MS : 0;
  const lastAttemptAt = observations[observations.length - 1].at;
  const daysSinceLast = (now.getTime() - lastAttemptAt.getTime()) / DAY_MS;
  const repeatedMistakes = repeatedMistakesOf(observations);
  const heavyHints = heavyHintAnswers >= 2 && heavyHintAnswers / Math.max(1, practiceAnswers) >= 0.5;
  const calibration = calibrationOf(observations);
  const lastOutcome = observations[observations.length - 1];
  const recentMisses = observations.slice(-5).filter((o) => o.score === 0).length;

  let status: MasteryStatusV2;
  if (effective < 2) status = "not_enough_evidence";
  else if (accuracy < 0.6) status = "needs_review";
  else if (recentMisses >= 3 || (repeatedMistakes > 0 && lastOutcome.score === 0)) status = "needs_review";
  else if (due && overdueDays >= Math.max(intervalDays, 2)) status = "needs_review";
  else if (accuracy >= 0.8 && plan.successSessions >= 2 && effective >= 3 && !due && lastOutcome.score > 0) status = "secure";
  else status = "developing";

  const confidence = status === "not_enough_evidence" ? "low" : confidenceFor(effective, occasions.length, daysSinceLast);
  // The range widens with thin evidence and with time since the last answer.
  const half = Math.min(0.5, bandFor(effective) + Math.min(0.1, Math.max(0, daysSinceLast - 30) / 300));

  // Plain-language explanation.
  const facts: string[] = [];
  facts.push(`${correct} of ${plural(answers, "answer")} correct across ${plural(occasions.length, "session")}`);
  if (plan.lastSuccessAt) {
    facts.push(`last correct ${daysAgoPhrase((now.getTime() - plan.lastSuccessAt.getTime()) / DAY_MS)}`);
  } else {
    facts.push("no clean correct answer yet");
  }
  const untilReview = (nextReviewAt.getTime() - now.getTime()) / DAY_MS;
  let meaning: string;
  const improve: string[] = [];
  switch (status) {
    case "not_enough_evidence":
      meaning = "that's not enough to estimate yet";
      improve.push("Answer a few more questions, and come back on a different day: success across separate sessions is what counts.");
      break;
    case "needs_review":
      if (due && overdueDays >= Math.max(intervalDays, 2) && accuracy >= 0.6) {
        meaning = "it's been long enough that it may be slipping";
        improve.push("A short review now, then a correct answer in a later session, would rebuild the estimate.");
      } else if (repeatedMistakes > 0 || recentMisses >= 3) {
        meaning = "the same kind of mistake keeps coming back";
        improve.push("Review the explanation for the questions you missed, then retry them in a new session.");
      } else {
        meaning = "the results so far are mostly incorrect";
        improve.push("Review the topic (or its prerequisites), then try two or three questions without hints.");
      }
      break;
    case "secure":
      meaning = `next check ${inDaysPhrase(untilReview)} keeps it secure`;
      improve.push(`Answer it correctly again ${inDaysPhrase(untilReview)}; the interval after that gets longer.`);
      break;
    default:
      if (due) {
        meaning = "it's due for a quick check now";
        improve.push("One correct answer today would confirm what you know.");
      } else if (plan.successSessions < 2) {
        meaning = `one more correct answer ${inDaysPhrase(Math.max(untilReview, 1))} would confirm it`;
        improve.push(`Get it right again in a separate session (${inDaysPhrase(Math.max(untilReview, 1))}); answers in the same sitting count for less.`);
      } else {
        meaning = "a few more correct answers without hints would make it secure";
        improve.push("Answer a few more questions without hints, including a harder one.");
      }
  }
  if (heavyHints) improve.push("Try without hints first: answers that needed two or more hints count for less.");
  if (calibration === "overconfident") improve.push("You marked some wrong answers as \"sure\". Slow down and check your work on this topic.");
  if (calibration === "underconfident") improve.push("You often get these right while unsure. Your understanding may be better than it feels.");
  if (confidence === "low" && status !== "not_enough_evidence" && occasions.length < 2) {
    improve.push("Practice on another day: one sitting is only a snapshot.");
  }

  return {
    status,
    estimate: Math.round(accuracy * 100),
    low: Math.round(clamp01(accuracy - half) * 100),
    high: Math.round(clamp01(accuracy + half) * 100),
    confidence,
    answers,
    correct,
    sessions: occasions.length,
    successSessions: plan.successSessions,
    lastAttemptAt,
    lastSuccessAt: plan.lastSuccessAt,
    nextReviewAt,
    intervalDays,
    due,
    overdueDays,
    repeatedMistakes,
    heavyHints,
    calibration,
    explanation: `${facts.join(", ")}; ${meaning}.`,
    improve: [...new Set(improve)],
  };
}

export const STATUS_LABEL: Record<MasteryStatusV2, string> = {
  secure: "Secure",
  developing: "Developing",
  needs_review: "Needs review",
  not_enough_evidence: "Not enough evidence",
};
