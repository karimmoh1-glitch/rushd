"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { CLASS_COLORS } from "@/lib/class-colors";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { TRY_MAX_ITEMS } from "@/lib/try/parse-week";
import type { Prisma } from "@/generated/prisma/client";

// Adds the week a visitor ranked on the homepage (kept only in their browser
// until now) to their new account. Everything arrives from the client, so it
// is validated like any other input; classes are matched by name or created.

const DAY_MS = 86_400_000;

const ItemSchema = z.object({
  kind: z.enum(["assignment", "exam"]),
  title: z.string().trim().min(1).max(160),
  className: z.string().trim().min(1).max(60),
  dueAt: z.iso.datetime(),
  minutes: z.number().int().min(5).max(600),
});

export type TryImportResult = { error: string } | { success: true; created: number };

type TriedItem = z.infer<typeof ItemSchema>;

/** Keeps items due between 30 days ago and a year from now. */
function itemsInRange(items: TriedItem[]): TriedItem[] {
  const now = Date.now();
  const earliest = now - 30 * DAY_MS;
  const latest = now + 365 * DAY_MS;
  const kept: TriedItem[] = [];
  for (const item of items) {
    const dueTime = Date.parse(item.dueAt);
    if (dueTime > earliest && dueTime < latest) {
      kept.push(item);
    }
  }
  return kept;
}

/** Maps each class name (lowercased) to a class id, creating missing classes. */
async function classIdsByName(userId: string, items: TriedItem[]): Promise<Map<string, string>> {
  const existing = await db.class.findMany({ where: { userId, archived: false }, select: { id: true, name: true } });
  const idByName = new Map<string, string>();
  for (const cls of existing) {
    idByName.set(cls.name.toLowerCase(), cls.id);
  }

  // New classes continue the color rotation after the existing ones.
  let colorIndex = existing.length;
  const uniqueNames = new Set<string>();
  for (const item of items) {
    uniqueNames.add(item.className);
  }
  for (const name of uniqueNames) {
    if (idByName.has(name.toLowerCase())) {
      continue;
    }
    const color = CLASS_COLORS[colorIndex % CLASS_COLORS.length].value;
    colorIndex++;
    const created = await db.class.create({
      data: { userId, name, color },
      select: { id: true },
    });
    idByName.set(name.toLowerCase(), created.id);
  }
  return idByName;
}

export async function importTriedWeek(raw: unknown): Promise<TryImportResult> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`try-import:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return { error: "That's a lot of adding at once. Try again in a bit." };
  }
  const parsed = z.array(ItemSchema).min(1).max(TRY_MAX_ITEMS).safeParse(raw);
  if (!parsed.success) {
    return { error: "That list couldn't be read. Add the items by hand instead." };
  }

  const items = itemsInRange(parsed.data);
  if (items.length === 0) {
    return { error: "Those dates have passed." };
  }

  const idByName = await classIdsByName(user.id, items);

  const assignmentRows: Prisma.AssignmentCreateManyInput[] = [];
  const examRows: Prisma.ExamCreateManyInput[] = [];
  for (const item of items) {
    // Every name is in the map: classIdsByName created any that were missing.
    const classId = idByName.get(item.className.toLowerCase())!;
    if (item.kind === "assignment") {
      assignmentRows.push({ userId: user.id, classId, title: item.title, dueAt: new Date(item.dueAt), estimatedMinutes: item.minutes });
    } else {
      examRows.push({ userId: user.id, classId, title: item.title, examAt: new Date(item.dueAt), prepMinutes: item.minutes });
    }
  }
  await db.$transaction([
    db.assignment.createMany({ data: assignmentRows }),
    db.exam.createMany({ data: examRows }),
  ]);

  await logEvent(user.id, "try_week_imported", { count: items.length });
  await logEvent(user.id, "assignment_created", { count: items.length, via: "try_week" });
  await regeneratePlanSnapshot(user.id);
  return { success: true, created: items.length };
}
