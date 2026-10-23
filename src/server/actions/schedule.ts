"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";
import { addDaysToKey, diffDateKeys, localDateKey, localMinuteOfDay, resolveTimeZone } from "@/lib/time/zone";
import { PLANNING_HORIZON_DAYS } from "@/lib/planning/constants";
import type { Prisma } from "@/generated/prisma/client";

// A block the student pins, moves or resizes is saved as a ScheduleBlock row
// that the planner treats as fixed. Every write is scoped to the session user.

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
  const profile = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return resolveTimeZone(profile?.timezone);
}

type BlockTime = { startMinute: number; durationMinutes: number };

/** True if the new block shares any minute with one of the other blocks. */
function overlapsAny(newBlock: BlockTime, others: BlockTime[]): boolean {
  const newEnd = newBlock.startMinute + newBlock.durationMinutes;
  for (const other of others) {
    const otherEnd = other.startMinute + other.durationMinutes;
    if (newBlock.startMinute < otherEnd && other.startMinute < newEnd) {
      return true;
    }
  }
  return false;
}

/** Pins (or moves/resizes) a block. Rejects overlaps with the student's other
 * pinned blocks, past times, and work they don't own or already finished. */
export async function pinBlock(input: z.infer<typeof BlockSchema>): Promise<ScheduleActionResult> {
  const user = await requireUserOrThrow();
  const parsed = BlockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid block." };
  const block = parsed.data;

  // The day must be inside the planning window, and not already over.
  const timeZone = await userTimeZone(user.id);
  const now = new Date();
  const today = localDateKey(now, timeZone);
  const daysFromToday = diffDateKeys(today, block.date);
  if (daysFromToday < 0 || daysFromToday >= PLANNING_HORIZON_DAYS) {
    return { error: `Pick a day between today and ${addDaysToKey(today, PLANNING_HORIZON_DAYS - 1)}.` };
  }
  const blockEnd = block.startMinute + block.durationMinutes;
  if (daysFromToday === 0 && blockEnd <= localMinuteOfDay(now, timeZone)) {
    return { error: "That time has already passed today." };
  }

  // The item must exist, belong to this student, and still be open.
  if (block.kind === "assignment") {
    const owned = await db.assignment.findFirst({
      where: { id: block.itemId, userId: user.id, status: { not: "COMPLETED" } },
      select: { id: true },
    });
    if (!owned) return { error: "That assignment isn't open any more." };
  } else {
    const owned = await db.exam.findFirst({ where: { id: block.itemId, userId: user.id }, select: { id: true } });
    if (!owned) return { error: "That exam no longer exists." };
  }

  // Compare against the student's other blocks that day (not the one being moved).
  const sameDayWhere: Prisma.ScheduleBlockWhereInput = { userId: user.id, localDate: block.date };
  if (block.blockId) {
    sameDayWhere.id = { not: block.blockId };
  }
  const sameDay = await db.scheduleBlock.findMany({
    where: sameDayWhere,
    select: { startMinute: true, durationMinutes: true },
  });
  if (overlapsAny(block, sameDay)) {
    return { error: "That overlaps another block you've placed. Pick a different time." };
  }

  let assignmentId: string | null = null;
  let examId: string | null = null;
  if (block.kind === "assignment") {
    assignmentId = block.itemId;
  } else {
    examId = block.itemId;
  }
  const data = {
    localDate: block.date,
    startMinute: block.startMinute,
    durationMinutes: block.durationMinutes,
    assignmentId,
    examId,
  };

  let eventName: string;
  if (block.blockId) {
    const result = await db.scheduleBlock.updateMany({ where: { id: block.blockId, userId: user.id }, data });
    if (result.count === 0) return { error: "That block no longer exists." };
    eventName = "schedule_block_moved";
  } else {
    await db.scheduleBlock.create({ data: { userId: user.id, ...data } });
    eventName = "schedule_block_pinned";
  }

  await logEvent(user.id, eventName, { kind: block.kind });
  revalidate();
  return { success: true };
}

export async function unpinBlock(blockId: string): Promise<ScheduleActionResult> {
  const user = await requireUserOrThrow();
  if (typeof blockId !== "string" || blockId.length > 64) return { error: "Invalid block." };
  const result = await db.scheduleBlock.deleteMany({ where: { id: blockId, userId: user.id } });
  if (result.count === 0) return { error: "That block no longer exists." };
  revalidate();
  return { success: true };
}

/** Drops every pinned block from today on — the plan returns to fully
 * automatic. The UI confirms (with a count) before calling this. */
export async function clearPinnedBlocks(): Promise<ScheduleActionResult & { cleared?: number }> {
  const user = await requireUserOrThrow();
  const timeZone = await userTimeZone(user.id);
  const today = localDateKey(new Date(), timeZone);
  const result = await db.scheduleBlock.deleteMany({
    where: { userId: user.id, localDate: { gte: today } },
  });
  await logEvent(user.id, "schedule_blocks_cleared", { count: result.count });
  revalidate();
  return { success: true, cleared: result.count };
}
