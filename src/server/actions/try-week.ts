"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { CLASS_COLORS } from "@/lib/class-colors";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { TRY_MAX_ITEMS } from "@/lib/try/parse-week";

// Adds the week a visitor ranked on the homepage (kept only in their browser
// until now) to their new account. Everything arrives from the client, so it
// is validated like any other input; classes are matched by name or created.

const DAY = 86_400_000;

const ItemSchema = z.object({
  kind: z.enum(["assignment", "exam"]),
  title: z.string().trim().min(1).max(160),
  className: z.string().trim().min(1).max(60),
  dueAt: z.iso.datetime(),
  minutes: z.number().int().min(5).max(600),
});

export type TryImportResult = { error: string } | { success: true; created: number };

export async function importTriedWeek(raw: unknown): Promise<TryImportResult> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`try-import:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return { error: "That's a lot of adding at once. Try again in a bit." };
  const parsed = z.array(ItemSchema).min(1).max(TRY_MAX_ITEMS).safeParse(raw);
  if (!parsed.success) return { error: "That list couldn't be read. Add the items by hand instead." };

  const now = Date.now();
  const items = parsed.data.filter((i) => {
    const t = Date.parse(i.dueAt);
    return t > now - 30 * DAY && t < now + 365 * DAY;
  });
  if (items.length === 0) return { error: "Those dates have passed." };

  const existing = await db.class.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true } });
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
  let colorIndex = existing.length;
  for (const name of new Set(items.map((i) => i.className))) {
    if (byName.has(name.toLowerCase())) continue;
    const created = await db.class.create({
      data: { userId: user.id, name, color: CLASS_COLORS[colorIndex++ % CLASS_COLORS.length].value },
      select: { id: true },
    });
    byName.set(name.toLowerCase(), created.id);
  }

  const classOf = (name: string) => byName.get(name.toLowerCase())!;
  const assignments = items.filter((i) => i.kind === "assignment");
  const exams = items.filter((i) => i.kind === "exam");
  await db.$transaction([
    db.assignment.createMany({
      data: assignments.map((i) => ({ userId: user.id, classId: classOf(i.className), title: i.title, dueAt: new Date(i.dueAt), estimatedMinutes: i.minutes })),
    }),
    db.exam.createMany({
      data: exams.map((i) => ({ userId: user.id, classId: classOf(i.className), title: i.title, examAt: new Date(i.dueAt), prepMinutes: i.minutes })),
    }),
  ]);

  await logEvent(user.id, "try_week_imported", { count: items.length });
  await logEvent(user.id, "assignment_created", { count: items.length, via: "try_week" });
  await regeneratePlanSnapshot(user.id);
  return { success: true, created: items.length };
}
