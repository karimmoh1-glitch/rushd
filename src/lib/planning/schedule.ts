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
  AvailabilityWindow,
  ScheduledSession,
  DayPlan,
  DayStatus,
  WorkItem,
} from "./types";

/** The calendar day `date` falls on in `timeZone` ("YYYY-MM-DD"). */
export function dateKey(date: Date, timeZone?: string | null): string {
  return localDateKey(date, timeZone);
}

interface Interval {
  start: number;
  end: number;
}

interface DayState {
  key: string;
  dow: number;
  free: Interval[];
  windowMinutes: number;
  plannedMinutes: number;
  capRemaining: number;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function subtractInterval(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const i of intervals) {
    if (cut.end <= i.start || cut.start >= i.end) {
      out.push(i);
      continue;
    }
    if (cut.start > i.start) out.push({ start: i.start, end: cut.start });
    if (cut.end < i.end) out.push({ start: cut.end, end: i.end });
  }
  return out;
}

function sumMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}

function roundUpTo(minute: number, step: number): number {
  return Math.ceil(minute / step) * step;
}

/**
 * Deterministic plan generation. See docs/PLANNING_ENGINE.md for the full
 * explanation of scoring and scheduling behavior.
 *
 * In short: items are ranked by score; each, in rank order, claims the
 * earliest open time in the student's availability windows. Work is spread
 * one block per day first (spaced practice, room for other things), then any
 * remainder that would otherwise miss its deadline is packed into extra
 * blocks. Nothing is ever placed after its due time, work is never planned
 * earlier than the lead window, and anything that cannot fit before its
 * deadline is reported as a shortfall instead of silently dropped.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const timeZone = resolveTimeZone(input.timeZone);
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const preferred = Math.max(
    MIN_BLOCK_MINUTES,
    Math.min(MAX_SESSION_MINUTES, input.preferences?.preferredSessionMinutes ?? MAX_SESSION_MINUTES),
  );
  const breakMinutes = Math.max(0, input.preferences?.breakMinutes ?? 0);
  const maxDaily = input.preferences?.maxDailyMinutes ?? null;

  const todayKey = localDateKey(input.now, timeZone);
  const nowMinute = localMinuteOfDay(input.now, timeZone);
  const horizonEndKey = addDaysToKey(todayKey, horizonDays - 1);

  const scored = scoreAndRank(input.workItems, input.now, timeZone);

  // --- Build each day's free time from the recurring weekly windows. ---------
  const days = new Map<string, DayState>();
  for (let i = 0; i < horizonDays; i++) {
    const key = addDaysToKey(todayKey, i);
    const dow = dayOfWeekForKey(key);
    let free = mergeIntervals(
      input.availability
        .filter((w) => w.dayOfWeek === dow)
        .map((w) => ({ start: w.startMinute, end: w.endMinute })),
    );
    if (key === todayKey) {
      // Time that already passed today isn't available any more.
      const from = roundUpTo(nowMinute, 5);
      free = mergeIntervals(
        free.map((w) => ({ start: Math.max(w.start, from), end: w.end })),
      );
    }
    days.set(key, {
      key,
      dow,
      free,
      windowMinutes: sumMinutes(free),
      plannedMinutes: 0,
      capRemaining: Number.POSITIVE_INFINITY,
    });
  }

  const sessions: ScheduledSession[] = [];
  const scoredById = new Map(scored.map((s) => [`${s.item.kind}:${s.item.id}`, s]));

  // --- Pinned (locked / hand-placed) blocks: fixed commitments. --------------
  const pinnedMinutesByItem = new Map<string, number>();
  for (const pb of input.pinnedBlocks ?? []) {
    const day = days.get(pb.date);
    const entry = scoredById.get(`${pb.kind}:${pb.itemId}`);
    if (!day || !entry) continue; // outside the horizon, or the item is gone
    const end = pb.startMinute + pb.durationMinutes;
    if (pb.date === todayKey && end <= nowMinute) continue; // already over
    day.free = subtractInterval(day.free, { start: pb.startMinute, end });
    day.plannedMinutes += pb.durationMinutes;
    const k = `${pb.kind}:${pb.itemId}`;
    pinnedMinutesByItem.set(k, (pinnedMinutesByItem.get(k) ?? 0) + pb.durationMinutes);
    sessions.push({
      item: entry.item,
      scheduledDate: pb.date,
      scheduledMinutes: pb.durationMinutes,
      startMinute: pb.startMinute,
      endMinute: end,
      score: entry.score,
      reasonCode: entry.reasonCode,
      pinned: true,
      blockId: pb.id,
    });
  }
  for (const day of days.values()) {
    day.capRemaining =
      maxDaily === null ? Number.POSITIVE_INFINITY : Math.max(0, maxDaily - day.plannedMinutes);
  }

  /** Places up to `want` minutes in the earliest free slot on `day` that can
   * hold a worthwhile block, ending no later than `notAfter`. */
  function placeBlock(
    day: DayState,
    want: number,
    notAfter: number | null,
  ): { start: number; end: number } | null {
    const needed = Math.min(want, MIN_BLOCK_MINUTES);
    for (let idx = 0; idx < day.free.length; idx++) {
      const iv = day.free[idx];
      const end = notAfter === null ? iv.end : Math.min(iv.end, notAfter);
      const len = end - iv.start;
      if (len <= 0) continue;
      const chunk = Math.min(want, len, day.capRemaining);
      if (chunk < needed) continue;
      const start = iv.start;
      const nextStart = start + chunk + breakMinutes;
      if (nextStart >= iv.end) day.free.splice(idx, 1);
      else iv.start = nextStart;
      day.capRemaining -= chunk;
      day.plannedMinutes += chunk;
      return { start, end: start + chunk };
    }
    return null;
  }

  const unscheduledMinutesByItem: Record<string, number> = {};
  const deferredMinutesByItem: Record<string, number> = {};
  const warnings: PlanWarning[] = [];
  const shortByDueDay = new Map<string, number>();

  for (const scoredItem of scored) {
    const { item } = scoredItem;
    const itemKey = `${item.kind}:${item.id}`;
    let remaining = Math.max(0, item.remainingMinutes - (pinnedMinutesByItem.get(itemKey) ?? 0));
    if (remaining === 0) continue;

    const dueKey = localDateKey(item.dueAt, timeZone);
    const dueMinute = localMinuteOfDay(item.dueAt, timeZone);
    const isOverdue = item.dueAt.getTime() < input.now.getTime();

    // Overdue work may use any open capacity (catching up is still useful).
    // Otherwise: not before the lead window, never after the due moment.
    const firstKey = isOverdue
      ? todayKey
      : maxKey(todayKey, addDaysToKey(dueKey, -LEAD_WINDOW_DAYS));
    const lastKey = isOverdue ? horizonEndKey : minKey(dueKey, horizonEndKey);

    const windowKeys: string[] = [];
    if (diffDateKeys(firstKey, lastKey) >= 0) {
      for (let k = firstKey; diffDateKeys(k, lastKey) >= 0; k = addDaysToKey(k, 1)) {
        windowKeys.push(k);
      }
    }

    const emit = (day: DayState, block: { start: number; end: number }) => {
      sessions.push({
        item,
        scheduledDate: day.key,
        scheduledMinutes: block.end - block.start,
        startMinute: block.start,
        endMinute: block.end,
        score: scoredItem.score,
        reasonCode: scoredItem.reasonCode,
      });
      remaining -= block.end - block.start;
    };
    const deadlineClip = (day: DayState) => (!isOverdue && day.key === dueKey ? dueMinute : null);

    // Pass 1 — spread: at most one block per day, so a big task is paced over
    // several days instead of crammed into one sitting.
    for (const key of windowKeys) {
      if (remaining <= 0) break;
      const day = days.get(key);
      if (!day) continue;
      const block = placeBlock(day, Math.min(remaining, preferred), deadlineClip(day));
      if (block) emit(day, block);
    }

    // Pass 2 — catch-up: whatever would still miss its deadline is packed into
    // extra blocks wherever capacity remains.
    const deadlineIsInRange = isOverdue || diffDateKeys(dueKey, horizonEndKey) >= 0;
    if (remaining > 0 && deadlineIsInRange) {
      for (const key of windowKeys) {
        const day = days.get(key);
        if (!day) continue;
        while (remaining > 0) {
          const block = placeBlock(day, Math.min(remaining, preferred), deadlineClip(day));
          if (!block) break;
          emit(day, block);
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
        });
        const bucket = isOverdue ? todayKey : dueKey;
        shortByDueDay.set(bucket, (shortByDueDay.get(bucket) ?? 0) + remaining);
      } else {
        deferredMinutesByItem[item.id] = remaining;
      }
    }
  }

  if (input.workItems.length > 0 && input.availability.length === 0) {
    warnings.unshift({ type: "NO_AVAILABILITY" });
  }
  for (const [date, shortMinutes] of [...shortByDueDay.entries()].sort()) {
    const day = days.get(date);
    warnings.push({
      type: "OVERLOADED_DAY",
      date,
      shortMinutes,
      availableMinutes: day?.windowMinutes ?? 0,
      plannedMinutes: day?.plannedMinutes ?? 0,
    });
  }

  sessions.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      (a.startMinute ?? 0) - (b.startMinute ?? 0) ||
      a.item.id.localeCompare(b.item.id),
  );

  const dayPlans: DayPlan[] = [...days.values()].map((d) => {
    // A pinned block may sit outside the windows (the student's choice), so
    // "capacity" is whichever is larger — a day never reads as over 100% full.
    const total = Math.max(d.windowMinutes, d.plannedMinutes);
    const status: DayStatus =
      total === 0
        ? "none"
        : d.plannedMinutes === 0
          ? "open"
          : d.plannedMinutes >= total * 0.9 || d.capRemaining === 0
            ? "full"
            : "balanced";
    return {
      date: d.key,
      dayOfWeek: d.dow,
      availableMinutes: d.windowMinutes,
      plannedMinutes: d.plannedMinutes,
      status,
    };
  });

  return {
    scored,
    sessions,
    unscheduledMinutesByItem,
    deferredMinutesByItem,
    days: dayPlans,
    warnings,
  };
}

function maxKey(a: string, b: string): string {
  return diffDateKeys(a, b) >= 0 ? b : a;
}

function minKey(a: string, b: string): string {
  return diffDateKeys(a, b) >= 0 ? a : b;
}

/** Re-exported for callers that only need the type. */
export type { WorkItem, AvailabilityWindow };
