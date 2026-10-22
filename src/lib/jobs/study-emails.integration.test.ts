import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import type { EmailMessage } from "@/lib/email/send";
import { sendStreakNudges, sendWeeklyDigests } from "./study-emails";

// Real database and planner; email delivery is captured, not sent.

// Sunday 2026-10-25, 10:00 AM in Los Angeles (the helper's time zone).
const SUNDAY_MORNING = new Date("2026-10-25T17:00:00Z");
// Thursday 2026-10-22, 6:00 PM in Los Angeles.
const THURSDAY_EVENING = new Date("2026-10-23T01:00:00Z");

describe("study emails (real DB, captured mail)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function student(emails: boolean) {
    const u = await createTestUser({ displayName: "Mia" });
    users.push(u.id);
    await db.profile.update({ where: { userId: u.id }, data: { emailReminders: emails } });
    return u;
  }

  it("sends the Sunday email once, ranked, with an unsubscribe link, and skips opted-out students", async () => {
    const on = await student(true);
    const off = await student(false);
    const cls = await db.class.create({ data: { userId: on.id, name: "Biology" } });
    await db.assignment.create({ data: { userId: on.id, classId: cls.id, title: "Cell lab writeup", dueAt: new Date("2026-10-27T06:59:00Z"), estimatedMinutes: 60 } });

    const sent: EmailMessage[] = [];
    const send = async (m: EmailMessage) => (sent.push(m), true);
    const r = await sendWeeklyDigests(30_000, { send, now: SUNDAY_MORNING, userIds: [on.id, off.id] });
    expect(r.sent).toBe(1);
    expect(sent[0].to).toBe(on.email);
    expect(sent[0].subject).toBe("Your week: start with Cell lab writeup");
    expect(sent[0].text).toContain("Biology");
    expect(sent[0].unsubscribeUrl).toMatch(/\/api\/email\/unsubscribe\?u=.+&t=.+/);

    const again = await sendWeeklyDigests(30_000, { send, now: SUNDAY_MORNING, userIds: [on.id] });
    expect(again.sent).toBe(0);
    const weekday = await sendWeeklyDigests(30_000, { send, now: THURSDAY_EVENING, userIds: [off.id] });
    expect(weekday.sent).toBe(0);
  });

  it("releases the claim when a send fails, so the student is tried again", async () => {
    const u = await student(true);
    const failed = await sendWeeklyDigests(30_000, { send: async () => false, now: SUNDAY_MORNING, userIds: [u.id] });
    expect(failed.sent).toBe(0);
    expect((await db.profile.findUniqueOrThrow({ where: { userId: u.id } })).lastDigestAt).toBeNull();
    const retried = await sendWeeklyDigests(30_000, { send: async () => true, now: SUNDAY_MORNING, userIds: [u.id] });
    expect(retried.sent).toBe(1);
  });

  it("nudges in the evening only when a 3+ day streak would break", async () => {
    const u = await student(true);
    for (const daysAgo of [1, 2, 3]) {
      await db.event.create({ data: { userId: u.id, name: "study_session_completed", createdAt: new Date(THURSDAY_EVENING.getTime() - daysAgo * 86_400_000) } });
    }
    const sent: EmailMessage[] = [];
    const send = async (m: EmailMessage) => (sent.push(m), true);

    expect((await sendStreakNudges(30_000, { send, now: SUNDAY_MORNING, userIds: [u.id] })).sent).toBe(0); // morning
    const r = await sendStreakNudges(30_000, { send, now: THURSDAY_EVENING, userIds: [u.id] });
    expect(r.sent).toBe(1);
    expect(sent[0].subject).toBe("Keep your 3-day streak");
    expect((await sendStreakNudges(30_000, { send, now: THURSDAY_EVENING, userIds: [u.id] })).sent).toBe(0); // once a day
  });
});
