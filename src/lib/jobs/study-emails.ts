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
import { streakNudgeEmail, weeklyDigestEmail } from "@/lib/email/templates";

// Study emails for students who have them on. The Sunday email goes out when
// it is Sunday where the student lives; the streak nudge only in their
// late afternoon or evening, at most once a day, and only for streaks of 3+ days. Both stop the
// moment the student turns emails off (Settings or the unsubscribe link).

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
/** Local hours (inclusive) when a streak nudge may go out. */
const EVENING_START = 15;
const EVENING_END = 21;
// The evening cron runs every 6 hours (05, 11, 17, 23 UTC), so every time zone
// has a run inside this 7-hour local window.
const DAY = 86_400_000;

function appUrl() {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

type Candidate = { userId: string; displayName: string; timezone: string; lastDigestAt: Date | null; lastNudgeAt: Date | null; user: { email: string } };

/** Every opted-in student matching `where`, a page at a time in a stable
 * order, so nobody is starved by students skipped for their time zone. */
async function* candidates(where: object, userIds?: string[]): AsyncGenerator<Candidate[]> {
  let cursor: string | undefined;
  for (;;) {
    const page = await db.profile.findMany({
      where: {
        AND: [
          { emailReminders: true, user: { onboardingCompletedAt: { not: null } }, ...where },
          userIds ? { userId: { in: userIds } } : {},
          // Keyset paging: unaffected by rows that leave the filter mid-run.
          cursor ? { userId: { gt: cursor } } : {},
        ],
      },
      select: { userId: true, displayName: true, timezone: true, lastDigestAt: true, lastNudgeAt: true, user: { select: { email: true } } },
      orderBy: { userId: "asc" },
      take: BATCH,
    });
    if (page.length === 0) return;
    yield page;
    if (page.length < BATCH) return;
    cursor = page[page.length - 1].userId;
  }
}

async function release(userId: string, data: { lastDigestAt?: Date | null; lastNudgeAt?: Date | null }) {
  await db.profile.update({ where: { userId }, data }).catch(() => {});
}

/** Claims a send before it happens (so a cron that fires twice can't email
 * twice); the claim is undone if the send fails. */
async function claim(userId: string, field: "lastDigestAt" | "lastNudgeAt", olderThan: Date, now: Date): Promise<boolean> {
  const r = await db.profile.updateMany({
    where: { userId, OR: [{ [field]: null }, { [field]: { lt: olderThan } }] },
    data: { [field]: now },
  });
  return r.count === 1;
}

export async function sendWeeklyDigests(budgetMs: number, deps: EmailJobDeps = {}): Promise<EmailJobReport> {
  const report: EmailJobReport = { sent: 0, skipped: 0, failed: 0, outOfTime: false };
  if (!emailConfigured() && !deps.send) return report;
  const send = deps.send ?? sendEmail;
  const now = deps.now ?? new Date();
  const deadline = Date.now() + budgetMs;
  const olderThan = new Date(now.getTime() - 6 * DAY);
  outer: for await (const page of candidates({ OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: olderThan } }] }, deps.userIds)) {
    for (const p of page) {
      if (Date.now() > deadline) {
        report.outOfTime = true;
        break outer;
      }
      const tz = resolveTimeZone(p.timezone);
      if (dayOfWeekForKey(localDateKey(now, tz)) !== 0) {
        report.skipped++;
        continue;
      }
      if (!(await claim(p.userId, "lastDigestAt", olderThan, now))) continue;
      try {
        const plan = await generatePlanForUser(p.userId, now);
        const weekEnd = now.getTime() + 7 * DAY;
        const items = plan.scored
          .filter((s) => s.item.dueAt.getTime() <= weekEnd)
          .slice(0, 5)
          .map((s) => ({ title: s.item.title, className: s.item.className, pulse: pulseOf(s.score), due: formatDueDate(s.item.dueAt, tz, now) }));
        const plannedMinutes = plan.sessions.reduce((sum, s) => sum + s.scheduledMinutes, 0);
        const streak = await getStreak(p.userId, tz, now);
        const unsub = unsubscribeUrl(appUrl(), p.userId);
        const mail = weeklyDigestEmail({ name: p.displayName || null, items, plannedMinutes, streak: streak.current, appUrl: appUrl(), unsubscribeUrl: unsub });
        if (await send({ to: p.user.email, ...mail, unsubscribeUrl: unsub })) report.sent++;
        else await release(p.userId, { lastDigestAt: p.lastDigestAt });
      } catch (error) {
        // One student's problem never stops the others; they're retried next run.
        console.error("[email] digest failed", (error as Error)?.name ?? typeof error);
        report.failed++;
        await release(p.userId, { lastDigestAt: p.lastDigestAt });
      }
    }
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
  outer: for await (const page of candidates({ OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: olderThan } }] }, deps.userIds)) {
    for (const p of page) {
      if (Date.now() > deadline) {
        report.outOfTime = true;
        break outer;
      }
      const tz = resolveTimeZone(p.timezone);
      const hour = zonedParts(now, tz).hour;
      if (hour < EVENING_START || hour > EVENING_END) {
        report.skipped++;
        continue;
      }
      const streak = await getStreak(p.userId, tz, now).catch(() => null);
      if (!streak || streak.current < 3 || streak.todayDone) {
        report.skipped++;
        continue;
      }
      if (!(await claim(p.userId, "lastNudgeAt", olderThan, now))) continue;
      try {
        const plan = await generatePlanForUser(p.userId, now);
        const unsub = unsubscribeUrl(appUrl(), p.userId);
        const mail = streakNudgeEmail({ streak: streak.current, next: plan.scored[0]?.item.title ?? null, appUrl: appUrl(), unsubscribeUrl: unsub });
        if (await send({ to: p.user.email, ...mail, unsubscribeUrl: unsub })) report.sent++;
        else await release(p.userId, { lastNudgeAt: p.lastNudgeAt });
      } catch (error) {
        console.error("[email] nudge failed", (error as Error)?.name ?? typeof error);
        report.failed++;
        await release(p.userId, { lastNudgeAt: p.lastNudgeAt });
      }
    }
  }
  return report;
}
