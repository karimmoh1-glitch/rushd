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
// evening, at most once a day, and only for streaks of 3+ days. Both stop the
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
  outOfTime: boolean;
}

const BATCH = 300;
const DAY = 86_400_000;

function appUrl() {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

async function candidates(where: object, userIds?: string[]) {
  return db.profile.findMany({
    where: { emailReminders: true, user: { onboardingCompletedAt: { not: null } }, ...(userIds ? { userId: { in: userIds } } : {}), ...where },
    select: { userId: true, displayName: true, timezone: true, user: { select: { email: true } } },
    take: BATCH,
  });
}

export async function sendWeeklyDigests(budgetMs: number, deps: EmailJobDeps = {}): Promise<EmailJobReport> {
  const report: EmailJobReport = { sent: 0, skipped: 0, outOfTime: false };
  if (!emailConfigured() && !deps.send) return report;
  const send = deps.send ?? sendEmail;
  const now = deps.now ?? new Date();
  const deadline = Date.now() + budgetMs;
  const people = await candidates({ OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(now.getTime() - 6 * DAY) } }] }, deps.userIds);

  for (const p of people) {
    if (Date.now() > deadline) {
      report.outOfTime = true;
      break;
    }
    const tz = resolveTimeZone(p.timezone);
    if (dayOfWeekForKey(localDateKey(now, tz)) !== 0) {
      report.skipped++;
      continue;
    }
    const plan = await generatePlanForUser(p.userId, now);
    const weekEnd = now.getTime() + 7 * DAY;
    const items = plan.scored
      .filter((s) => s.item.dueAt.getTime() <= weekEnd)
      .slice(0, 5)
      .map((s) => ({ title: s.item.title, className: s.item.className, pulse: pulseOf(s.score), due: formatDueDate(s.item.dueAt, tz, now) }));
    const plannedMinutes = plan.sessions.reduce((sum, s) => sum + s.scheduledMinutes, 0);
    const streak = await getStreak(p.userId, tz, now);
    const mail = weeklyDigestEmail({
      name: p.displayName || null,
      items,
      plannedMinutes,
      streak: streak.current,
      appUrl: appUrl(),
      unsubscribeUrl: unsubscribeUrl(appUrl(), p.userId),
    });
    if (await send({ to: p.user.email, ...mail, unsubscribeUrl: unsubscribeUrl(appUrl(), p.userId) })) {
      await db.profile.update({ where: { userId: p.userId }, data: { lastDigestAt: now } });
      report.sent++;
    }
  }
  return report;
}

export async function sendStreakNudges(budgetMs: number, deps: EmailJobDeps = {}): Promise<EmailJobReport> {
  const report: EmailJobReport = { sent: 0, skipped: 0, outOfTime: false };
  if (!emailConfigured() && !deps.send) return report;
  const send = deps.send ?? sendEmail;
  const now = deps.now ?? new Date();
  const deadline = Date.now() + budgetMs;
  const people = await candidates({ OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: new Date(now.getTime() - 20 * 60 * 60 * 1000) } }] }, deps.userIds);

  for (const p of people) {
    if (Date.now() > deadline) {
      report.outOfTime = true;
      break;
    }
    const tz = resolveTimeZone(p.timezone);
    const hour = zonedParts(now, tz).hour;
    if (hour < 16 || hour > 21) {
      report.skipped++;
      continue;
    }
    const streak = await getStreak(p.userId, tz, now);
    if (streak.current < 3 || streak.todayDone) {
      report.skipped++;
      continue;
    }
    const plan = await generatePlanForUser(p.userId, now);
    const mail = streakNudgeEmail({
      streak: streak.current,
      next: plan.scored[0]?.item.title ?? null,
      appUrl: appUrl(),
      unsubscribeUrl: unsubscribeUrl(appUrl(), p.userId),
    });
    if (await send({ to: p.user.email, ...mail, unsubscribeUrl: unsubscribeUrl(appUrl(), p.userId) })) {
      await db.profile.update({ where: { userId: p.userId }, data: { lastNudgeAt: now } });
      report.sent++;
    }
  }
  return report;
}
