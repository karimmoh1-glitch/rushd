"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";
import { addDaysToKey, diffDateKeys, localDateKey, localMinuteOfDay, resolveTimeZone } from "@/lib/time/zone";
import { PLANNING_HORIZON_DAYS } from "@/lib/planning/constants";

// Student control over the schedule. Auto-planned blocks are recomputed every
// time the plan is read; a block the student pins, moves, or resizes becomes
// a ScheduleBlock row that the planner treats as fixed (see schedule.ts).
// Every write is scoped to the session user and to work they own.

export type ScheduleActionResult = { error: string } | { success: true };

const BlockSchema = z
  .object({
    kind: z.enum(["assignment", "exam"]),
    itemId: z.string().min(1).max(64),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid day."),
    startMinute: z.number().int().min(0).max(1439),
    durationMinutes: z.number().int().min(15, "Blocks are at least 15 minutes.").max(240, "Blocks are at most 4 hours."),
    /** When editing an existing pinned block. */
    blockId: z.string().min(1).max(64).optional(),
  })
  .refine((b) => b.startMinute + b.durationMinutes <= 1440, {
    error: "A block has to end by midnight.",
  });

function revalidate() {
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

async function userTimeZone(userId: string): Promise<string> {
  const p = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return resolveTimeZone(p?.timezone);
}

/** Pins (or moves/resizes) a block. Rejects overlaps with the student's other
 * pinned blocks, past times, and work they don't own or already finished. */
export async function pinBlock(input: z.infer<typeof BlockSchema>): Promise<ScheduleActionResult> {
  const user = await requireUserOrThrow();
  const parsed = BlockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid block." };
  const b = parsed.data;

  const tz = await userTimeZone(user.id);
  const now = new Date();
  const today = localDateKey(now, tz);
  const offset = diffDateKeys(today, b.date);
  if (offset < 0 || offset >= PLANNING_HORIZON_DAYS) {
    return { error: `Pick a day between today and ${addDaysToKey(today, PLANNING_HORIZON_DAYS - 1)}.` };
  }
  if (offset === 0 && b.startMinute + b.durationMinutes <= localMinuteOfDay(now, tz)) {
    return { error: "That time has already passed today." };
  }

  // The item must exist, belong to this student, and still be open.
  if (b.kind === "assignment") {
    const owned = await db.assignment.findFirst({
      where: { id: b.itemId, userId: user.id, status: { not: "COMPLETED" } },
      select: { id: true },
    });
    if (!owned) return { error: "That assignment isn't open any more." };
  } else {
    const owned = await db.exam.findFirst({ where: { id: b.itemId, userId: user.id }, select: { id: true } });
    if (!owned) return { error: "That exam no longer exists." };
  }

  const sameDay = await db.scheduleBlock.findMany({
    where: { userId: user.id, localDate: b.date, ...(b.blockId ? { id: { not: b.blockId } } : {}) },
    select: { startMinute: true, durationMinutes: true },
  });
  const end = b.startMinute + b.durationMinutes;
  if (sameDay.some((o) => b.startMinute < o.startMinute + o.durationMinutes && o.startMinute < end)) {
    return { error: "That overlaps another block you've placed. Pick a different time." };
  }

  const data = {
    localDate: b.date,
    startMinute: b.startMinute,
    durationMinutes: b.durationMinutes,
    assignmentId: b.kind === "assignment" ? b.itemId : null,
    examId: b.kind === "exam" ? b.itemId : null,
  };
  if (b.blockId) {
    const r = await db.scheduleBlock.updateMany({ where: { id: b.blockId, userId: user.id }, data });
    if (r.count === 0) return { error: "That block no longer exists." };
  } else {
    await db.scheduleBlock.create({ data: { userId: user.id, ...data } });
  }

  await logEvent(user.id, b.blockId ? "schedule_block_moved" : "schedule_block_pinned", { kind: b.kind });
  revalidate();
  return { success: true };
}

export async function unpinBlock(blockId: string): Promise<ScheduleActionResult> {
  const user = await requireUserOrThrow();
  if (typeof blockId !== "string" || blockId.length > 64) return { error: "Invalid block." };
  const r = await db.scheduleBlock.deleteMany({ where: { id: blockId, userId: user.id } });
  if (r.count === 0) return { error: "That block no longer exists." };
  revalidate();
  return { success: true };
}

/** Drops every pinned block from today on — the plan returns to fully
 * automatic. The UI confirms (with a count) before calling this. */
export async function clearPinnedBlocks(): Promise<ScheduleActionResult & { cleared?: number }> {
  const user = await requireUserOrThrow();
  const tz = await userTimeZone(user.id);
  const r = await db.scheduleBlock.deleteMany({
    where: { userId: user.id, localDate: { gte: localDateKey(new Date(), tz) } },
  });
  await logEvent(user.id, "schedule_blocks_cleared", { count: r.count });
  revalidate();
  return { success: true, cleared: r.count };
}
