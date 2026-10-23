import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { feedAvailable } from "@/lib/feed/service";
import { formatDateInZone } from "@/lib/time/zone";
import { FeedControls } from "./feed-controls";
import { PageHeader } from "@/components/page-section";

export const metadata: Metadata = { title: "Canvas calendar feed" };
export const maxDuration = 60;

const STEPS = [
  "In Canvas, open Calendar (left menu).",
  "At the bottom of the right sidebar, choose Calendar Feed.",
  "Copy the link it shows (it ends in .ics) and paste it into Calendar feed link.",
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
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/settings#integrations", label: "Settings" }}
        title="Canvas calendar feed"
        description={
          <>
            For schools that turn off Canvas access tokens. Your calendar feed lists every assignment and due date, and works
            everywhere. Rushd only reads it.
          </>
        }
      />

      {!feed ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <ol className="space-y-5">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-xs text-muted-foreground">{index + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
            <li className="pl-10 text-sm text-muted-foreground">
              Have a Canvas access token instead?{" "}
              <Link href="/integrations/canvas" className="text-foreground underline underline-offset-4">Connect Canvas directly</Link>.
            </li>
          </ol>
          <div className="space-y-4 rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
            {feedAvailable() ? (
              <FeedControls connected={false} />
            ) : (
              <p className="text-sm text-muted-foreground">Calendar import isn&apos;t set up on this server yet.</p>
            )}
            <ul className="space-y-1.5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              <li>The feed link is private to you, so Rushd stores it encrypted, like a password.</li>
              <li>It shows what&apos;s due, not what you&apos;ve turned in: check things off in Rushd as you finish them.</li>
              <li>Rushd re-reads it every day. You can disconnect anytime.</li>
            </ul>
          </div>
        </div>
      ) : (
        <section className="max-w-2xl space-y-6 rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
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
