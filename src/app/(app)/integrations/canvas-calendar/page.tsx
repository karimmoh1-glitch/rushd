import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { feedAvailable } from "@/lib/feed/service";
import { formatDateInZone } from "@/lib/time/zone";
import { FeedControls } from "./feed-controls";

export const metadata: Metadata = { title: "Canvas calendar feed" };
export const maxDuration = 60;

const STEPS = [
  "In Canvas, open Calendar (left menu).",
  "At the bottom of the right sidebar, choose Calendar Feed.",
  "Copy the link it shows (it ends in .ics) and paste it below.",
];

export default async function CanvasCalendarPage() {
  const user = await requireUser();
  const timeZone = user.profile?.timezone;
  const [feed, count] = await Promise.all([
    db.calendarFeed.findUnique({ where: { userId: user.id }, select: { host: true, status: true, lastSyncAt: true, lastSyncError: true } }),
    db.assignment.count({ where: { userId: user.id, source: "CALENDAR", canvasRemovedAt: null } }),
  ]);

  let lastReadText = "";
  if (feed?.lastSyncAt) {
    const when = formatDateInZone(feed.lastSyncAt, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    lastReadText = `Last read ${when}.`;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <Link href="/integrations/canvas" className="text-sm text-muted-foreground hover:text-foreground">Canvas</Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Canvas calendar feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For schools that turn off Canvas access tokens. Your calendar feed lists every assignment and due date, and works
          everywhere. Rushd only reads it.
        </p>
      </header>

      {!feed ? (
        <section className="space-y-5">
          <ol className="space-y-2 text-sm">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px]">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          {feedAvailable() ? (
            <FeedControls connected={false} />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Calendar import isn&apos;t set up on this server yet.</p>
          )}
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>The feed link is private to you, so Rushd stores it encrypted, like a password.</li>
            <li>It shows what&apos;s due, not what you&apos;ve turned in: check things off in Rushd as you finish them.</li>
            <li>Rushd re-reads it every day. You can disconnect anytime.</li>
          </ul>
        </section>
      ) : (
        <section className="space-y-6">
          <div className="space-y-1 text-sm">
            <p>
              Connected to {feed.host}. {count} upcoming assignment{count === 1 ? "" : "s"}.{" "}
              {lastReadText}
            </p>
            {feed.status === "ERROR" && feed.lastSyncError && <p className="text-warning">{feed.lastSyncError}</p>}
          </div>
          <FeedControls connected />
        </section>
      )}
    </div>
  );
}
