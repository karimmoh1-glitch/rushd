// "What changed": compares the week the student last saw with the plan just
// generated, and says why each difference happened in one short sentence.
// Pure, so it is unit-tested directly (diff.test.ts). The snapshot it reads is
// stored compactly on Plan.snapshot (src/lib/planning/snapshots.ts).

import { DEFAULT_HORIZON_DAYS } from "./constants";
import { addDaysToKey, diffDateKeys, formatDateKey } from "@/lib/time/zone";
import type { ScheduledSession, WorkKind } from "./types";

/** Why a plan was regenerated. Stored on Plan.trigger and in the plan_regenerated event. */
export type PlanTrigger =
  | "block_skipped"
  | "not_this_week"
  | "estimate_changed"
  | "block_moved"
  | "assignment_added"
  | "assignment_completed"
  | "exam_added"
  | "practice_completed"
  | "missed_session"
  | "availability_changed"
  | "course_changed"
  | "sync"
  | "new_day"
  | "other";

export interface SnapshotBlock {
  date: string;
  start: number;
  minutes: number;
}

export interface SnapshotItem {
  kind: WorkKind;
  id: string;
  title: string;
  className: string;
  blocks: SnapshotBlock[];
}

export interface PlanSnapshot {
  v: 1;
  /** The student's local day when the plan was made. */
  today: string;
  items: SnapshotItem[];
}

export type ChangeCause =
  | "skipped"
  | "not_this_week"
  | "missed"
  | "completed"
  | "new_work"
  | "estimate"
  | "mastery"
  | "made_room"
  | "freed_time"
  | "other";

export interface PlanChange {
  type: "moved" | "added" | "removed" | "more_time" | "less_time";
  kind: WorkKind;
  itemId: string;
  title: string;
  className: string;
  /** First planned day before and after (null when there was / is none this week). */
  fromDate: string | null;
  toDate: string | null;
  minutesBefore: number;
  minutesAfter: number;
  cause: ChangeCause;
  /** The work that caused a ripple ("to make room for Essay draft"). */
  causeTitle?: string;
  /** For "missed": the day of the missed block. */
  causeDate?: string;
}

export interface ChangeContext {
  trigger: PlanTrigger;
  /** The student's local day now. */
  today: string;
  /** Item keys ("kind:id") the student skipped today. */
  skipped?: Set<string>;
  /** Item keys the student moved out of this week. */
  notThisWeek?: Set<string>;
  /** Item keys finished since the previous plan. */
  completed?: Set<string>;
  /** Item keys created since the previous plan. */
  added?: Set<string>;
  /** Item keys whose estimate the student changed. */
  estimateChanged?: Set<string>;
  /** "kind:id@YYYY-MM-DD": the student studied that item on that day (a finished study session). */
  studied?: Set<string>;
}

/** Changes shown at most; the most specific causes come first. */
export const MAX_CHANGES_SHOWN = 3;
/** Smaller differences in planned minutes aren't worth mentioning. */
const MINUTES_WORTH_MENTIONING = 15;

export function itemKeyOf(kind: WorkKind, id: string): string {
  return `${kind}:${id}`;
}

/** The compact copy of the shown week that's stored with each plan. */
export function snapshotFromSessions(
  sessions: ScheduledSession[],
  today: string,
  days: number = DEFAULT_HORIZON_DAYS,
): PlanSnapshot {
  const last = addDaysToKey(today, days - 1);
  const byKey = new Map<string, SnapshotItem>();
  for (const session of sessions) {
    if (diffDateKeys(today, session.scheduledDate) < 0 || diffDateKeys(session.scheduledDate, last) < 0) continue;
    const key = itemKeyOf(session.item.kind, session.item.id);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { kind: session.item.kind, id: session.item.id, title: session.item.title, className: session.item.className, blocks: [] };
      byKey.set(key, entry);
    }
    entry.blocks.push({ date: session.scheduledDate, start: session.startMinute ?? 0, minutes: session.scheduledMinutes });
  }
  const items = [...byKey.values()];
  for (const item of items) item.blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  items.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { v: 1, today, items };
}

/** Reads a stored snapshot defensively (it's JSON from the database). */
export function parseSnapshot(raw: unknown): PlanSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<PlanSnapshot>;
  if (value.v !== 1 || typeof value.today !== "string" || !Array.isArray(value.items)) return null;
  return value as PlanSnapshot;
}

interface Window {
  first: string | null;
  minutes: number;
}

function windowFrom(item: SnapshotItem | undefined, today: string): Window {
  let first: string | null = null;
  let minutes = 0;
  for (const block of item?.blocks ?? []) {
    if (diffDateKeys(today, block.date) < 0) continue;
    if (first === null || block.date < first) first = block.date;
    minutes += block.minutes;
  }
  return { first, minutes };
}

/** The latest past day a still-open item had a block that wasn't studied. */
function missedDay(item: SnapshotItem, ctx: ChangeContext): string | null {
  const key = itemKeyOf(item.kind, item.id);
  if (ctx.completed?.has(key)) return null;
  let missed: string | null = null;
  for (const block of item.blocks) {
    if (diffDateKeys(block.date, ctx.today) <= 0) continue; // today or later: not missed (yet)
    if (ctx.studied?.has(`${key}@${block.date}`)) continue;
    if (missed === null || block.date > missed) missed = block.date;
  }
  return missed;
}

/** Items whose missed blocks are worth explaining: still open, not studied that day. */
export function missedBlocks(previous: PlanSnapshot, ctx: ChangeContext): Map<string, string> {
  const missed = new Map<string, string>();
  for (const item of previous.items) {
    if (item.kind === "review") continue; // a missed review simply stays due
    const day = missedDay(item, ctx);
    if (day) missed.set(itemKeyOf(item.kind, item.id), day);
  }
  return missed;
}

const CAUSE_ORDER: ChangeCause[] = ["skipped", "not_this_week", "missed", "completed", "new_work", "estimate", "mastery", "made_room", "freed_time", "other"];

/**
 * Compares the previous plan with the new one over the days both cover
 * (today onward) and explains each difference. Deterministic: changes are
 * ordered by how specific their cause is, then by day, then by title.
 */
export function diffPlans(previous: PlanSnapshot | null, next: PlanSnapshot, ctx: ChangeContext): PlanChange[] {
  if (!previous) return [];
  const prevByKey = new Map(previous.items.map((item) => [itemKeyOf(item.kind, item.id), item]));
  const nextByKey = new Map(next.items.map((item) => [itemKeyOf(item.kind, item.id), item]));
  const missed = missedBlocks(previous, ctx);
  const keys = [...new Set([...prevByKey.keys(), ...nextByKey.keys()])].sort();

  // The work that set things in motion, for ripple sentences.
  // The student's own action first (a skip or deferral), then new work, then a missed block.
  const titleOf = (key: string) => (nextByKey.get(key) ?? prevByKey.get(key))!.title;
  const firstKey = (test: (key: string) => boolean | undefined) => keys.find((key) => test(key));
  const pushKey =
    firstKey((k) => ctx.skipped?.has(k) || ctx.notThisWeek?.has(k)) ?? firstKey((k) => ctx.added?.has(k)) ?? firstKey((k) => missed.has(k));
  const freeKey = firstKey((k) => ctx.completed?.has(k) || ctx.skipped?.has(k) || ctx.notThisWeek?.has(k));
  const pushTitle = pushKey ? titleOf(pushKey) : undefined;
  const freeTitle = freeKey ? titleOf(freeKey) : undefined;

  const changes: PlanChange[] = [];
  for (const key of keys) {
    const before = prevByKey.get(key);
    const after = nextByKey.get(key);
    const item = (after ?? before)!;
    const prevWindow = windowFrom(before, ctx.today);
    const nextWindow = windowFrom(after, ctx.today);
    const base = {
      kind: item.kind,
      itemId: item.id,
      title: item.title,
      className: item.className,
      fromDate: prevWindow.first,
      toDate: nextWindow.first,
      minutesBefore: prevWindow.minutes,
      minutesAfter: nextWindow.minutes,
    };

    let type: PlanChange["type"] | null = null;
    if (prevWindow.first && !nextWindow.first) type = "removed";
    else if (!prevWindow.first && nextWindow.first) type = "added";
    else if (prevWindow.first && nextWindow.first && prevWindow.first !== nextWindow.first) type = "moved";
    else if (prevWindow.first && nextWindow.first) {
      const delta = nextWindow.minutes - prevWindow.minutes;
      if (delta >= MINUTES_WORTH_MENTIONING) type = "more_time";
      else if (delta <= -MINUTES_WORTH_MENTIONING) type = "less_time";
    }
    // A missed block with nothing to show for it this week is still news.
    if (!type && missed.has(key) && nextWindow.first) type = "moved";
    if (!type) continue;

    const later = type === "moved" && prevWindow.first !== null && nextWindow.first !== null && nextWindow.first > prevWindow.first;
    const earlier = type === "moved" && !later && prevWindow.first !== null;
    let cause: ChangeCause = "other";
    let causeTitle: string | undefined;
    let causeDate: string | undefined;
    if (ctx.skipped?.has(key) && (type === "moved" || type === "removed")) cause = "skipped";
    else if (ctx.notThisWeek?.has(key)) cause = "not_this_week";
    else if (missed.has(key)) {
      cause = "missed";
      causeDate = missed.get(key);
    } else if (ctx.completed?.has(key)) cause = "completed";
    else if (ctx.added?.has(key)) cause = "new_work";
    else if (ctx.estimateChanged?.has(key)) cause = "estimate";
    else if (ctx.trigger === "practice_completed" && (item.kind === "review" || type === "more_time" || type === "less_time")) cause = "mastery";
    else if ((later || type === "removed") && pushTitle) {
      cause = "made_room";
      causeTitle = pushTitle;
    } else if (earlier && freeTitle) {
      cause = "freed_time";
      causeTitle = freeTitle;
    }

    changes.push({ ...base, type, cause, ...(causeTitle ? { causeTitle } : {}), ...(causeDate ? { causeDate } : {}) });
  }

  changes.sort(
    (a, b) =>
      CAUSE_ORDER.indexOf(a.cause) - CAUSE_ORDER.indexOf(b.cause) ||
      (a.toDate ?? a.fromDate ?? "").localeCompare(b.toDate ?? b.fromDate ?? "") ||
      a.title.localeCompare(b.title),
  );
  return changes;
}

/** "today", "tomorrow", "Thursday" (within a week), or "Oct 30". */
export function dayName(date: string, today: string): string {
  const days = diffDateKeys(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1 && days < 7) return formatDateKey(date, { weekday: "long" });
  if (days < -1 && days > -7) return formatDateKey(date, { weekday: "long" });
  return formatDateKey(date, { month: "short", day: "numeric" });
}

function possessiveDay(date: string, today: string): string {
  const name = dayName(date, today);
  if (name === "yesterday") return "yesterday's";
  return `${name}'s`;
}

function minutesPhrase(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** One short, specific sentence for a change. */
export function describeChange(change: PlanChange, today: string): string {
  const on = change.toDate ? dayName(change.toDate, today) : "later";
  // "today", "tomorrow", "on Saturday", "on Oct 30".
  const onDay = on === "today" || on === "tomorrow" || on === "later" ? on : `on ${on}`;
  const title = change.title;
  const delta = Math.abs(change.minutesAfter - change.minutesBefore);

  switch (change.cause) {
    case "skipped":
      return change.type === "removed" ? `Took ${title} off today, as you asked.` : `Moved ${title} to ${on} because you skipped it today.`;
    case "not_this_week":
      return change.type === "removed" ? `Took ${title} out of this week, as you asked.` : `Moved ${title} to ${on}, out of this week as you asked.`;
    case "missed": {
      const missedDay = change.causeDate ? possessiveDay(change.causeDate, today) : "an earlier";
      if (change.type === "added" || change.fromDate === null) return `Put ${title} back on your plan ${onDay} because you missed ${missedDay} block.`;
      if (change.type === "more_time") return `Gave ${title} ${minutesPhrase(delta)} more this week because you missed ${missedDay} block.`;
      if (change.type === "removed") return `You missed ${missedDay} block for ${title}, and there's no time left for it before it's due.`;
      return `Moved ${title} to ${on} because you missed ${missedDay} block.`;
    }
    case "completed":
      return `Took ${title} off your plan. It's done.`;
    case "new_work":
      return `Planned ${title}, starting ${on}.`;
    case "estimate":
      if (change.type === "more_time" || change.type === "less_time") return `${title} now has ${minutesPhrase(change.minutesAfter)} this week, from your new estimate.`;
      if (change.type === "removed") return `${title} no longer needs time this week, from your new estimate.`;
      return `Moved ${title} to ${on} after you changed its estimate.`;
    case "mastery":
      if (change.kind === "review" && change.type === "removed") return `Dropped the ${change.className} review: your latest practice covered it.`;
      if (change.kind === "review") return `Added ${title.replace(/^Review: /, "a review of ")} ${onDay}, from your latest practice.`;
      if (change.type === "more_time") return `Gave ${title} ${minutesPhrase(delta)} more prep: your latest practice shows more to review.`;
      if (change.type === "less_time") return `Trimmed ${title} prep by ${minutesPhrase(delta)}: your latest practice looks solid.`;
      return `Moved ${title} to ${on} after your latest practice.`;
    case "made_room":
      if (change.type === "removed") return `${title} has no time this week now: it went to ${change.causeTitle}.`;
      return `Moved ${title} to ${on} to make room for ${change.causeTitle}.`;
    case "freed_time":
      return `Moved ${title} up to ${on}, into time freed by ${change.causeTitle}.`;
    default:
      if (change.kind === "review" && change.type === "added") return `Added ${title.replace(/^Review: /, "a review of ")} ${onDay}: it's due.`;
      if (change.type === "added") return `Planned ${title} ${onDay}.`;
      if (change.type === "removed") return `${title} is off this week's plan.`;
      if (change.type === "more_time") return `${title} has ${minutesPhrase(delta)} more this week.`;
      if (change.type === "less_time") return `${title} has ${minutesPhrase(delta)} less this week.`;
      return `Moved ${title} to ${on}.`;
  }
}

/** The changes worth showing, as sentences. Ripple-only changes ("other")
 * are shown only when nothing more specific happened. */
export function summarizeChanges(changes: PlanChange[], today: string, limit: number = MAX_CHANGES_SHOWN): string[] {
  const specific = changes.filter((c) => c.cause !== "other");
  const chosen = (specific.length > 0 ? specific : changes).slice(0, limit);
  return chosen.map((change) => describeChange(change, today));
}
