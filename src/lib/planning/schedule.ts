import {
  MAX_SESSION_MINUTES,
  DEFAULT_HORIZON_DAYS,
  LEAD_WINDOW_DAYS,
  MIN_BLOCK_MINUTES,
} from "./constants";
import { scoreAndRank } from "./score";
import {
  addDaysToKey,
  dayOfWeekForKey,
  diffDateKeys,
  localDateKey,
  localMinuteOfDay,
  resolveTimeZone,
} from "@/lib/time/zone";
import type {
  PlanInput,
  PlanResult,
  PlanWarning,
  PlanPreferences,
  PinnedBlock,
  AvailabilityWindow,
  ScheduledSession,
  ScoredItem,
  DayPlan,
  DayStatus,
  PlanExclusion,
  WorkItem,
} from "./types";

/** The calendar day `date` falls on in `timeZone` ("YYYY-MM-DD"). */
export function dateKey(date: Date, timeZone?: string | null): string {
  return localDateKey(date, timeZone);
}

/** A stretch of time on one day, in minutes from local midnight. */
interface Interval {
  start: number;
  end: number;
}

/** What the scheduler tracks for each day while it fills the plan. */
interface DayState {
  key: string;
  dayOfWeek: number;
  /** Free time still open for new blocks, sorted and non-overlapping. */
  free: Interval[];
  /** Minutes inside the availability windows (after removing time already past today). */
  availableMinutes: number;
  plannedMinutes: number;
  /** Minutes left under the student's daily maximum. */
  dailyCapRemaining: number;
}

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

function compareIntervals(a: Interval, b: Interval): number {
  if (a.start < b.start) return -1;
  if (a.start > b.start) return 1;
  if (a.end < b.end) return -1;
  if (a.end > b.end) return 1;
  return 0;
}

/** Drops empty intervals, sorts the rest, and joins any that overlap or touch. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const nonEmpty = intervals.filter((interval) => interval.end > interval.start);
  nonEmpty.sort(compareIntervals);

  const merged: Interval[] = [];
  for (const interval of nonEmpty) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

/** Removes `cut` from every interval, splitting an interval in two if needed. */
function subtractInterval(intervals: Interval[], cut: Interval): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals) {
    const noOverlap = cut.end <= interval.start || cut.start >= interval.end;
    if (noOverlap) {
      result.push(interval);
      continue;
    }
    if (cut.start > interval.start) {
      result.push({ start: interval.start, end: cut.start });
    }
    if (cut.end < interval.end) {
      result.push({ start: cut.end, end: interval.end });
    }
  }
  return result;
}

function sumMinutes(intervals: Interval[]): number {
  let total = 0;
  for (const interval of intervals) {
    total += interval.end - interval.start;
  }
  return total;
}

function roundUpTo(minute: number, step: number): number {
  return Math.ceil(minute / step) * step;
}

// ---------------------------------------------------------------------------
// Date key helpers
// ---------------------------------------------------------------------------

function laterKey(a: string, b: string): string {
  if (diffDateKeys(a, b) >= 0) return b;
  return a;
}

function earlierKey(a: string, b: string): string {
  if (diffDateKeys(a, b) >= 0) return a;
  return b;
}

/** Every day key from `firstKey` to `lastKey`, inclusive. Empty if `lastKey` is earlier. */
function daysBetween(firstKey: string, lastKey: string): string[] {
  const keys: string[] = [];
  for (let key = firstKey; diffDateKeys(key, lastKey) >= 0; key = addDaysToKey(key, 1)) {
    keys.push(key);
  }
  return keys;
}

/** Items are tracked by kind + id, because an assignment and an exam could share an id. */
function itemKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

// ---------------------------------------------------------------------------
// The student's overrides and the course term
// ---------------------------------------------------------------------------

interface ItemExclusions {
  skipDates: Set<string>;
  /** No work before this day ("not this week"). */
  notBefore: string | null;
}

function exclusionsByItem(exclusions: PlanExclusion[]): Map<string, ItemExclusions> {
  const map = new Map<string, ItemExclusions>();
  for (const exclusion of exclusions) {
    const key = itemKey(exclusion.kind, exclusion.itemId);
    let entry = map.get(key);
    if (!entry) {
      entry = { skipDates: new Set(), notBefore: null };
      map.set(key, entry);
    }
    if (exclusion.type === "skip") {
      entry.skipDates.add(exclusion.date);
    } else if (!entry.notBefore || diffDateKeys(entry.notBefore, exclusion.date) > 0) {
      entry.notBefore = exclusion.date;
    }
  }
  return map;
}

/** Days the student's overrides allow. Also reports which kind of override removed any. */
function applyExclusions(
  dayKeys: string[],
  exclusions: ItemExclusions | undefined,
): { allowed: string[]; removedBy: "skip" | "not_this_week" | undefined } {
  if (!exclusions) return { allowed: dayKeys, removedBy: undefined };
  let removedBy: "skip" | "not_this_week" | undefined;
  const allowed: string[] = [];
  for (const key of dayKeys) {
    if (exclusions.notBefore && diffDateKeys(key, exclusions.notBefore) > 0) {
      removedBy = "not_this_week";
      continue;
    }
    if (exclusions.skipDates.has(key)) {
      removedBy ??= "skip";
      continue;
    }
    allowed.push(key);
  }
  return { allowed, removedBy };
}

/** Keeps only days inside the course's term (when the student set one). */
function withinTerm(dayKeys: string[], item: WorkItem): string[] {
  const start = item.term?.start ?? null;
  const end = item.term?.end ?? null;
  if (!start && !end) return dayKeys;
  return dayKeys.filter((key) => {
    if (start && diffDateKeys(start, key) < 0) return false;
    if (end && diffDateKeys(key, end) < 0) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Building the days
// ---------------------------------------------------------------------------

/** Builds each day's free time from the student's recurring weekly windows. */
function buildDays(
  availability: AvailabilityWindow[],
  todayKey: string,
  nowMinute: number,
  horizonDays: number,
): Map<string, DayState> {
  const days = new Map<string, DayState>();

  for (let i = 0; i < horizonDays; i++) {
    const key = addDaysToKey(todayKey, i);
    const dayOfWeek = dayOfWeekForKey(key);

    const windows: Interval[] = [];
    for (const window of availability) {
      if (window.dayOfWeek === dayOfWeek) {
        windows.push({ start: window.startMinute, end: window.endMinute });
      }
    }
    let free = mergeIntervals(windows);

    if (key === todayKey) {
      // Time that already passed today isn't available any more.
      const firstOpenMinute = roundUpTo(nowMinute, 5);
      const stillAhead: Interval[] = [];
      for (const interval of free) {
        stillAhead.push({ start: Math.max(interval.start, firstOpenMinute), end: interval.end });
      }
      free = mergeIntervals(stillAhead);
    }

    days.set(key, {
      key,
      dayOfWeek,
      free,
      availableMinutes: sumMinutes(free),
      plannedMinutes: 0,
      dailyCapRemaining: Number.POSITIVE_INFINITY,
    });
  }

  return days;
}

/**
 * Reserves the blocks the student pinned by hand. They are fixed: they take
 * their time out of the day and count toward the item's work. Returns the
 * pinned sessions and how many pinned minutes each item already has.
 */
function placePinnedBlocks(
  pinnedBlocks: PinnedBlock[],
  scored: ScoredItem[],
  days: Map<string, DayState>,
  todayKey: string,
  nowMinute: number,
): { sessions: ScheduledSession[]; pinnedMinutesByItem: Map<string, number> } {
  const scoredByKey = new Map<string, ScoredItem>();
  for (const scoredItem of scored) {
    scoredByKey.set(itemKey(scoredItem.item.kind, scoredItem.item.id), scoredItem);
  }

  const sessions: ScheduledSession[] = [];
  const pinnedMinutesByItem = new Map<string, number>();

  for (const block of pinnedBlocks) {
    const key = itemKey(block.kind, block.itemId);
    const day = days.get(block.date);
    const scoredItem = scoredByKey.get(key);
    // Skip blocks outside the horizon, or for work that no longer exists.
    if (!day || !scoredItem) continue;

    const end = block.startMinute + block.durationMinutes;
    // Skip blocks that already finished earlier today.
    if (block.date === todayKey && end <= nowMinute) continue;

    day.free = subtractInterval(day.free, { start: block.startMinute, end });
    day.plannedMinutes += block.durationMinutes;

    const minutesSoFar = pinnedMinutesByItem.get(key) ?? 0;
    pinnedMinutesByItem.set(key, minutesSoFar + block.durationMinutes);

    sessions.push({
      item: scoredItem.item,
      scheduledDate: block.date,
      scheduledMinutes: block.durationMinutes,
      startMinute: block.startMinute,
      endMinute: end,
      score: scoredItem.score,
      reasonCode: scoredItem.reasonCode,
      pinned: true,
      blockId: block.id,
    });
  }

  return { sessions, pinnedMinutesByItem };
}

// ---------------------------------------------------------------------------
// Placing blocks
// ---------------------------------------------------------------------------

/**
 * Takes up to `wantMinutes` from the earliest free slot on `day` that can
 * hold a worthwhile block. If `latestEnd` is given, the block must end by
 * then. Returns the placed block, or null if nothing fits.
 */
function placeBlock(
  day: DayState,
  wantMinutes: number,
  latestEnd: number | null,
  breakMinutes: number,
): Interval | null {
  // A block must be at least MIN_BLOCK_MINUTES, unless the whole request is shorter.
  const smallestUseful = Math.min(wantMinutes, MIN_BLOCK_MINUTES);

  for (let index = 0; index < day.free.length; index++) {
    const slot = day.free[index];

    let slotEnd = slot.end;
    if (latestEnd !== null) {
      slotEnd = Math.min(slot.end, latestEnd);
    }
    const slotLength = slotEnd - slot.start;
    if (slotLength <= 0) continue;

    const blockLength = Math.min(wantMinutes, slotLength, day.dailyCapRemaining);
    if (blockLength < smallestUseful) continue;

    // Use the start of the slot, and leave a break before the next block.
    const start = slot.start;
    const nextFreeStart = start + blockLength + breakMinutes;
    if (nextFreeStart >= slot.end) {
      day.free.splice(index, 1);
    } else {
      slot.start = nextFreeStart;
    }

    day.dailyCapRemaining -= blockLength;
    day.plannedMinutes += blockLength;
    return { start, end: start + blockLength };
  }

  return null;
}

/** On the due day, a block must end by the due time. Overdue work has no deadline left to respect. */
function latestEndMinute(
  dayKey: string,
  dueKey: string,
  dueMinute: number,
  isOverdue: boolean,
): number | null {
  if (!isOverdue && dayKey === dueKey) return dueMinute;
  return null;
}

function makeSession(scoredItem: ScoredItem, dayKey: string, block: Interval): ScheduledSession {
  return {
    item: scoredItem.item,
    scheduledDate: dayKey,
    scheduledMinutes: block.end - block.start,
    startMinute: block.start,
    endMinute: block.end,
    score: scoredItem.score,
    reasonCode: scoredItem.reasonCode,
  };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Sorts by day, then start time, then item id. */
function compareSessions(a: ScheduledSession, b: ScheduledSession): number {
  const byDate = a.scheduledDate.localeCompare(b.scheduledDate);
  if (byDate !== 0) return byDate;

  const aStart = a.startMinute ?? 0;
  const bStart = b.startMinute ?? 0;
  if (aStart < bStart) return -1;
  if (aStart > bStart) return 1;

  return a.item.id.localeCompare(b.item.id);
}

function dayStatus(day: DayState): DayStatus {
  // A pinned block may sit outside the windows (the student's choice), so
  // capacity is whichever is larger. A day never reads as over 100% full.
  const capacity = Math.max(day.availableMinutes, day.plannedMinutes);
  if (capacity === 0) return "none";
  if (day.plannedMinutes === 0) return "open";
  if (day.plannedMinutes >= capacity * 0.9 || day.dailyCapRemaining === 0) return "full";
  return "balanced";
}

/**
 * Deterministic plan generation (see docs/PLANNING_ENGINE.md).
 *
 * Items are ranked by score. In rank order, each item takes the earliest
 * open time in the student's availability. Work is first spread out to one
 * block per day; anything that would still miss its deadline is then packed
 * into extra blocks. Nothing is placed after its due time or earlier than
 * the lead window, and work that can't fit is reported as a shortfall.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const timeZone = resolveTimeZone(input.timeZone);
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;

  const preferences: PlanPreferences = input.preferences ?? {};
  // Block length is the student's preference, kept between 15 and 90 minutes.
  const requestedBlockMinutes = preferences.preferredSessionMinutes ?? MAX_SESSION_MINUTES;
  const blockMinutes = Math.max(MIN_BLOCK_MINUTES, Math.min(MAX_SESSION_MINUTES, requestedBlockMinutes));
  const breakMinutes = Math.max(0, preferences.breakMinutes ?? 0);
  const maxDailyMinutes = preferences.maxDailyMinutes ?? null;

  const todayKey = localDateKey(input.now, timeZone);
  const nowMinute = localMinuteOfDay(input.now, timeZone);
  const horizonEndKey = addDaysToKey(todayKey, horizonDays - 1);

  const scored = scoreAndRank(input.workItems, input.now, timeZone);
  const days = buildDays(input.availability, todayKey, nowMinute, horizonDays);

  const pinned = placePinnedBlocks(input.pinnedBlocks ?? [], scored, days, todayKey, nowMinute);
  const sessions = pinned.sessions;

  // The daily maximum counts pinned time too.
  for (const day of days.values()) {
    if (maxDailyMinutes === null) {
      day.dailyCapRemaining = Number.POSITIVE_INFINITY;
    } else {
      day.dailyCapRemaining = Math.max(0, maxDailyMinutes - day.plannedMinutes);
    }
  }

  const unscheduledMinutesByItem: Record<string, number> = {};
  const deferredMinutesByItem: Record<string, number> = {};
  const warnings: PlanWarning[] = [];
  const shortMinutesByDay = new Map<string, number>();
  const exclusions = exclusionsByItem(input.exclusions ?? []);

  for (const scoredItem of scored) {
    const item = scoredItem.item;
    const pinnedMinutes = pinned.pinnedMinutesByItem.get(itemKey(item.kind, item.id)) ?? 0;
    let remaining = Math.max(0, item.remainingMinutes - pinnedMinutes);
    if (remaining === 0) continue;

    const dueKey = localDateKey(item.dueAt, timeZone);
    const dueMinute = localMinuteOfDay(item.dueAt, timeZone);
    const isOverdue = item.dueAt.getTime() < input.now.getTime();

    // Overdue work may use any open time (catching up still helps).
    // Other work: not before the lead window, and never after the due day.
    let windowKeys: string[];
    if (isOverdue) {
      windowKeys = daysBetween(todayKey, horizonEndKey);
    } else {
      const leadStartKey = addDaysToKey(dueKey, -LEAD_WINDOW_DAYS);
      windowKeys = daysBetween(laterKey(todayKey, leadStartKey), earlierKey(dueKey, horizonEndKey));
    }

    // No work for a course outside its term. If that leaves no day at all,
    // say so instead of reporting a shortfall the student can't fix here.
    const termKeys = withinTerm(windowKeys, item);
    if (windowKeys.length > 0 && termKeys.length === 0) {
      if (!item.soft) {
        warnings.push({ type: "OUTSIDE_TERM", itemId: item.id, kind: item.kind, title: item.title, className: item.className });
      }
      continue;
    }

    // The student's "skip today" / "not this week".
    const { allowed: dayKeys, removedBy: overrideUsed } = applyExclusions(termKeys, exclusions.get(itemKey(item.kind, item.id)));

    // Pass 1, spread: at most one block per day, so a big task is paced over
    // several days instead of crammed into one sitting.
    for (const key of dayKeys) {
      if (remaining <= 0) break;
      const day = days.get(key);
      if (!day) continue;
      const latestEnd = latestEndMinute(day.key, dueKey, dueMinute, isOverdue);
      const block = placeBlock(day, Math.min(remaining, blockMinutes), latestEnd, breakMinutes);
      if (block) {
        sessions.push(makeSession(scoredItem, day.key, block));
        remaining -= block.end - block.start;
      }
    }

    // Pass 2, catch-up: whatever would still miss its deadline is packed
    // into extra blocks wherever there's room. Work due after the horizon
    // isn't packed; it's simply planned later.
    // Soft work (reviews) is never packed: if it doesn't fit, it waits.
    const deadlineIsInRange = !item.soft && (isOverdue || diffDateKeys(dueKey, horizonEndKey) >= 0);
    if (remaining > 0 && deadlineIsInRange) {
      for (const key of dayKeys) {
        const day = days.get(key);
        if (!day) continue;
        const latestEnd = latestEndMinute(day.key, dueKey, dueMinute, isOverdue);
        while (remaining > 0) {
          const block = placeBlock(day, Math.min(remaining, blockMinutes), latestEnd, breakMinutes);
          if (!block) break;
          sessions.push(makeSession(scoredItem, day.key, block));
          remaining -= block.end - block.start;
        }
        if (remaining <= 0) break;
      }
    }

    if (remaining > 0) {
      if (deadlineIsInRange) {
        unscheduledMinutesByItem[item.id] = remaining;
        warnings.push({
          type: "DEADLINE_SHORTFALL",
          itemId: item.id,
          kind: item.kind,
          title: item.title,
          className: item.className,
          dueAt: item.dueAt,
          overdue: isOverdue,
          shortMinutes: remaining,
          ...(overrideUsed ? { override: overrideUsed } : {}),
        });
        // Overdue shortfalls are counted on today; others on their due day.
        const shortDay = isOverdue ? todayKey : dueKey;
        const shortSoFar = shortMinutesByDay.get(shortDay) ?? 0;
        shortMinutesByDay.set(shortDay, shortSoFar + remaining);
      } else {
        deferredMinutesByItem[item.id] = remaining;
      }
    }
  }

  if (input.workItems.length > 0 && input.availability.length === 0) {
    warnings.unshift({ type: "NO_AVAILABILITY" });
  }

  const shortDays = [...shortMinutesByDay.keys()].sort();
  for (const date of shortDays) {
    const day = days.get(date);
    warnings.push({
      type: "OVERLOADED_DAY",
      date,
      shortMinutes: shortMinutesByDay.get(date) ?? 0,
      availableMinutes: day?.availableMinutes ?? 0,
      plannedMinutes: day?.plannedMinutes ?? 0,
    });
  }

  sessions.sort(compareSessions);

  const dayPlans: DayPlan[] = [];
  for (const day of days.values()) {
    dayPlans.push({
      date: day.key,
      dayOfWeek: day.dayOfWeek,
      availableMinutes: day.availableMinutes,
      plannedMinutes: day.plannedMinutes,
      status: dayStatus(day),
    });
  }

  return {
    scored,
    sessions,
    unscheduledMinutesByItem,
    deferredMinutesByItem,
    days: dayPlans,
    warnings,
  };
}
