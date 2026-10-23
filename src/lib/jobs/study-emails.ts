import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { pulseOf } from "@/lib/planning/pulse";
import { formatDueDate } from "@/lib/format";
import { dayOfWeekForKey, localDateKey, resolveTimeZone, zonedParts } from "@/lib/time/zone";
import { getStreak } from "@/lib/streak/load";
import { emailConfigured, sendEmail, type EmailMessage } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { streakNudgeEmail, weeklyDigestEmail, type DigestItem } from "@/lib/email/templates";
import { log } from "@/lib/log";

// Study emails for students who turned them on. The Sunday digest goes out when
// it's Sunday where the student lives; the streak nudge only in their late
// afternoon or evening, at most once a day, for streaks of 3+ days. Both stop
// as soon as the student turns emails off (Settings or the unsubscribe link).

export interface EmailJobDeps {
  send?: (msg: EmailMessage) => Promise<boolean>;
  now?: Date;
  /** Tests: only consider these students (the database is shared with production). */
  userIds?: string[];
}

export interface EmailJobReport {
  sent: number;
  skipped: number;
  failed: number;
  outOfTime: boolean;
}

const BATCH = 300;
/** Local hours (inclusive) when a streak nudge may go out. The evening cron runs
 * every 6 hours (05, 11, 17, 23 UTC), so every time zone gets a run in this window. */
const EVENING_START = 15;
const EVENING_END = 21;
const DAY = 86_400_000;

function appUrl() {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

type Candidate = { userId: string; displayName: string; timezone: string; lastDigestAt: Date | null; lastNudgeAt: Date | null; user: { email: string } };

/** One page of opted-in students matching `where`, after `cursor`, in userId order.
 * Keyset paging (userId > cursor) isn't thrown off by rows leaving the filter mid-run. */
async function loadCandidatePage(where: object, userIds: string[] | undefined, cursor: string | undefined): Promise<Candidate[]> {
  const testFilter = userIds ? { userId: { in: userIds } } : {};
  const afterCursor = cursor ? { userId: { gt: cursor } } : {};
  return db.profile.findMany({
    where: {
      AND: [{ emailReminders: true, user: { onboardingCompletedAt: { not: null } }, ...where }, testFilter, afterCursor],
    },
    select: { userId: true, displayName: true, timezone: true, lastDigestAt: true, lastNudgeAt: true, user: { select: { email: true } } },
    orderBy: { userId: "asc" },
    take: BATCH,
  });
}

/** Undoes a claim after a failed send, so the student is retried next run. */
async function release(userId: string, data: { lastDigestAt?: Date | null; lastNudgeAt?: Date | null }) {
  await db.profile.update({ where: { userId }, data }).catch(() => {});
}

/** Claims a send before it happens (so a cron that fires twice can't email
 * twice); the claim is undone if the send fails. */
async function claim(userId: string, field: "lastDigestAt" | "lastNudgeAt", olderThan: Date, now: Date): Promise<boolean> {
  const result = await db.profile.updateMany({
    where: { userId, OR: [{ [field]: null }, { [field]: { lt: olderThan } }] },
    data: { [field]: now },
  });
  return result.count === 1;
}

/** Builds and sends one student's digest. Returns whether the send worked. */
async function sendDigestTo(student: Candidate, timeZone: string, now: Date, send: (msg: EmailMessage) => Promise<boolean>): Promise<boolean> {
  const plan = await generatePlanForUser(student.userId, now);
  const weekEnd = now.getTime() + 7 * DAY;

  const items: DigestItem[] = [];
  for (const scored of plan.scored) {
    if (items.length === 5) break;
    if (scored.item.dueAt.getTime() > weekEnd) continue;
    items.push({
      title: scored.item.title,
      className: scored.item.className,
      pulse: pulseOf(scored.score),
      due: formatDueDate(scored.item.dueAt, timeZone, now),
    });
  }

  let plannedMinutes = 0;
  for (const session of plan.sessions) plannedMinutes += session.scheduledMinutes;

  const streak = await getStreak(student.userId, timeZone, now);
  const unsub = unsubscribeUrl(appUrl(), student.userId);
  const mail = weeklyDigestEmail({
    name: student.displayName || null,
    items,
    plannedMinutes,
    streak: streak.current,
    appUrl: appUrl(),
    unsubscribeUrl: unsub,
  });
  return send({ to: student.user.email, ...mail, unsubscribeUrl: unsub });
}

export async function sendWeeklyDigests(budgetMs: number, deps: EmailJobDeps = {}): Promise<EmailJobReport> {
  const report: EmailJobReport = { sent: 0, skipped: 0, failed: 0, outOfTime: false };
  if (!emailConfigured() && !deps.send) return report;
  const send = deps.send ?? sendEmail;
  const now = deps.now ?? new Date();
  const deadline = Date.now() + budgetMs;
  const olderThan = new Date(now.getTime() - 6 * DAY);
  const notSentRecently = { OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: olderThan } }] };

  let cursor: string | undefined = undefined;
  while (true) {
    const page = await loadCandidatePage(notSentRecently, deps.userIds, cursor);
    if (page.length === 0) break;

    for (const student of page) {
      if (Date.now() > deadline) {
        report.outOfTime = true;
        return report;
      }
      const timeZone = resolveTimeZone(student.timezone);
      const isSundayThere = dayOfWeekForKey(localDateKey(now, timeZone)) === 0;
      if (!isSundayThere) {
        report.skipped++;
        continue;
      }
      if (!(await claim(student.userId, "lastDigestAt", olderThan, now))) continue;

      try {
        const sent = await sendDigestTo(student, timeZone, now, send);
        if (sent) report.sent++;
        else await release(student.userId, { lastDigestAt: student.lastDigestAt });
      } catch (error) {
        // One student's problem never stops the others; they're retried next run.
        log.error("email.digest_failed", { err: error });
        report.failed++;
        await release(student.userId, { lastDigestAt: student.lastDigestAt });
      }
    }

    if (page.length < BATCH) break;
    cursor = page[page.length - 1].userId;
  }
  return report;
}

export async function sendStreakNudges(budgetMs: number, deps: EmailJobDeps = {}): Promise<EmailJobReport> {
  const report: EmailJobReport = { sent: 0, skipped: 0, failed: 0, outOfTime: false };
  if (!emailConfigured() && !deps.send) return report;
  const send = deps.send ?? sendEmail;
  const now = deps.now ?? new Date();
  const deadline = Date.now() + budgetMs;
  const olderThan = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const notNudgedRecently = { OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: olderThan } }] };

  let cursor: string | undefined = undefined;
  while (true) {
    const page = await loadCandidatePage(notNudgedRecently, deps.userIds, cursor);
    if (page.length === 0) break;

    for (const student of page) {
      if (Date.now() > deadline) {
        report.outOfTime = true;
        return report;
      }
      const timeZone = resolveTimeZone(student.timezone);
      const hour = zonedParts(now, timeZone).hour;
      if (hour < EVENING_START || hour > EVENING_END) {
        report.skipped++;
        continue;
      }
      const streak = await getStreak(student.userId, timeZone, now).catch(() => null);
      if (!streak || streak.current < 3 || streak.todayDone) {
        report.skipped++;
        continue;
      }
      if (!(await claim(student.userId, "lastNudgeAt", olderThan, now))) continue;

      try {
        const plan = await generatePlanForUser(student.userId, now);
        const unsub = unsubscribeUrl(appUrl(), student.userId);
        const nextTitle = plan.scored[0]?.item.title ?? null;
        const mail = streakNudgeEmail({ streak: streak.current, next: nextTitle, appUrl: appUrl(), unsubscribeUrl: unsub });
        const sent = await send({ to: student.user.email, ...mail, unsubscribeUrl: unsub });
        if (sent) report.sent++;
        else await release(student.userId, { lastNudgeAt: student.lastNudgeAt });
      } catch (error) {
        // One student's problem never stops the others; they're retried next run.
        log.error("email.nudge_failed", { err: error });
        report.failed++;
        await release(student.userId, { lastNudgeAt: student.lastNudgeAt });
      }
    }

    if (page.length < BATCH) break;
    cursor = page[page.length - 1].userId;
  }
  return report;
}
