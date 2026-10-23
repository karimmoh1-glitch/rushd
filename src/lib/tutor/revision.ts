// A revision plan for one upcoming exam, grounded in the course's own topics,
// the student's mastery, and the days left. Pure and deterministic. It only
// proposes sessions; nothing reaches the planner until the student confirms,
// and then only through the planner's own pinBlock action.

import type { MasteryStatusV2 } from "@/lib/learning/estimator";
import { addDaysToKey, dayOfWeekForKey, diffDateKeys, localDateKey, localMinuteOfDay } from "@/lib/time/zone";

export interface RevisionTopic {
  id: string;
  title: string;
  status: MasteryStatusV2;
  estimate: number | null;
  due: boolean;
}

export interface RevisionInput {
  exam: { id: string; title: string; at: Date };
  now: Date;
  timeZone: string;
  topics: RevisionTopic[];
  /** The student's weekly study hours (0 = Sunday). Empty = not set. */
  availability: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  /** Blocks already pinned on the planner, which a session must not overlap. */
  busy: { localDate: string; startMinute: number; durationMinutes: number }[];
  /** Days ahead the planner accepts pinned blocks for. */
  horizonDays: number;
  maxSessions?: number;
}

export interface RevisionSession {
  date: string; // YYYY-MM-DD, student's time zone
  startMinute: number;
  minutes: number;
  topics: string[];
  kind: "focus" | "mixed";
}

export interface RevisionPlan {
  examId: string;
  examTitle: string;
  examDate: string;
  daysLeft: number;
  sessions: RevisionSession[];
  /** Weakest first: what the plan is built around. */
  priorities: { title: string; status: MasteryStatusV2 }[];
  notes: string[];
}

const DEFAULT_WINDOW = { startMinute: 17 * 60, endMinute: 21 * 60 };
const LATEST_START_TODAY = 21 * 60;
const MINUTES: Record<MasteryStatusV2, number> = { needs_review: 25, developing: 20, not_enough_evidence: 15, secure: 10 };
const RANK: Record<MasteryStatusV2, number> = { needs_review: 0, developing: 1, not_enough_evidence: 2, secure: 3 };

/** Weakest first: needs review, developing (lowest estimate first), untested, then secure (due first). */
export function prioritizeTopics(topics: RevisionTopic[]): RevisionTopic[] {
  return [...topics].sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
    if (a.due !== b.due) return a.due ? -1 : 1;
    const ea = a.estimate ?? 101;
    const eb = b.estimate ?? 101;
    if (ea !== eb) return ea - eb;
    return a.title.localeCompare(b.title);
  });
}

/** Evenly spread `count` picks over `days`, always keeping the last one. */
function spread<T>(days: T[], count: number): T[] {
  if (days.length <= count) return days;
  if (count <= 1) return [days[days.length - 1]];
  const picked: T[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(days[Math.round((i * (days.length - 1)) / (count - 1))]);
  }
  return [...new Set(picked)];
}

function roundUp(minute: number, step: number): number {
  return Math.ceil(minute / step) * step;
}

/** The first start within the day's windows that fits and overlaps nothing. */
function findSlot(
  windows: { startMinute: number; endMinute: number }[],
  busy: { startMinute: number; durationMinutes: number }[],
  minutes: number,
  earliest: number,
): number | null {
  for (const w of [...windows].sort((a, b) => a.startMinute - b.startMinute)) {
    let start = roundUp(Math.max(w.startMinute, earliest), 15);
    while (start + minutes <= w.endMinute && start + minutes <= 1440) {
      const end = start + minutes;
      const clash = busy.find((b) => start < b.startMinute + b.durationMinutes && b.startMinute < end);
      if (!clash) return start;
      start = roundUp(clash.startMinute + clash.durationMinutes, 15);
    }
  }
  return null;
}

export function buildRevisionPlan(input: RevisionInput): RevisionPlan | { error: string } {
  const today = localDateKey(input.now, input.timeZone);
  const examDate = localDateKey(input.exam.at, input.timeZone);
  const daysLeft = diffDateKeys(today, examDate);
  if (daysLeft < 0) return { error: "That exam has already happened." };

  const ordered = prioritizeTopics(input.topics);
  const weak = ordered.filter((t) => t.status !== "secure");
  const secure = ordered.filter((t) => t.status === "secure");
  const notes: string[] = [];
  const priorities = ordered.slice(0, 8).map((t) => ({ title: t.title, status: t.status }));

  if (input.topics.length === 0) {
    notes.push("This course has no confirmed topics yet, so the sessions are general review. Add topics to target them.");
  }
  notes.push("Built from your topic map and practice results for this course. Rushd doesn't know what the exam actually covers or how it's weighted.");

  if (daysLeft === 0) {
    const skim = weak.slice(0, 3).map((t) => t.title);
    notes.push(skim.length ? `The exam is today: a short look at ${skim.join(", ")} is the best use of the time left.` : "The exam is today: a short, calm review of your notes beats cramming.");
    return { examId: input.exam.id, examTitle: input.exam.title, examDate, daysLeft, sessions: [], priorities, notes };
  }

  // Candidate days: today (if there's evening left) through the day before the exam, inside the planner's window.
  const nowMinute = localMinuteOfDay(input.now, input.timeZone);
  const days: string[] = [];
  for (let offset = 0; offset < daysLeft && offset < input.horizonDays; offset++) {
    if (offset === 0 && nowMinute >= LATEST_START_TODAY) continue;
    days.push(addDaysToKey(today, offset));
  }
  if (daysLeft > input.horizonDays) {
    notes.push(`The exam is ${daysLeft} days away; the planner only holds blocks ${input.horizonDays} days ahead, so this covers the first ${input.horizonDays}. Ask again closer to the date.`);
  }
  const maxSessions = Math.max(1, Math.min(8, input.maxSessions ?? 6));
  const chosen = spread(days, maxSessions);

  // Topic assignment: weakest topics first, then cycled again so the weak
  // ones come back on a later day; the last session mixes everything weak.
  const pool = weak.length ? weak : secure;
  const sessions: RevisionSession[] = [];
  const hasAvailability = input.availability.length > 0;
  if (!hasAvailability) notes.push("You haven't set study hours, so sessions are placed in the evening. Move them on your plan if that doesn't suit you.");
  let cursor = 0;
  let skipped = 0;
  chosen.forEach((date, index) => {
    const isLast = index === chosen.length - 1 && chosen.length > 1;
    let topics: RevisionTopic[];
    if (pool.length === 0) topics = [];
    else if (isLast) topics = [...weak.slice(0, 3), ...secure.filter((t) => t.due).slice(0, 1)];
    else {
      const perSession = pool.length > chosen.length ? 2 : 1;
      topics = [];
      for (let i = 0; i < perSession; i++) {
        const next = pool[cursor % pool.length];
        if (!topics.includes(next)) topics.push(next);
        cursor += 1;
      }
    }
    if (isLast && topics.length === 0 && pool.length) topics = pool.slice(0, 3);
    const raw = topics.length ? topics.reduce((sum, t) => sum + MINUTES[t.status], 0) : 30;
    const minutes = Math.max(20, Math.min(90, roundUp(raw, 5)));

    const dow = dayOfWeekForKey(date);
    const windows = hasAvailability ? input.availability.filter((w) => w.dayOfWeek === dow) : [DEFAULT_WINDOW];
    const busy = input.busy.filter((b) => b.localDate === date);
    const earliest = date === today ? nowMinute + 15 : 0;
    const start = findSlot(windows, busy, minutes, earliest);
    if (start === null) {
      skipped += 1;
      return;
    }
    sessions.push({
      date,
      startMinute: start,
      minutes,
      topics: topics.length ? topics.map((t) => t.title) : ["General review"],
      kind: isLast ? "mixed" : "focus",
    });
  });
  if (skipped > 0) notes.push(`${skipped} day${skipped === 1 ? " had" : "s had"} no free time in your study hours, so ${skipped === 1 ? "it was" : "they were"} skipped.`);
  if (sessions.length === 0 && days.length === 0) notes.push("There's no time left before the exam to schedule a session.");
  return { examId: input.exam.id, examTitle: input.exam.title, examDate, daysLeft, sessions, priorities, notes };
}
