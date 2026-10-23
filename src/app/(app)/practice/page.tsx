import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { getUsageSummary } from "@/lib/ai/usage";
import { formatDateInZone } from "@/lib/time/zone";
import { PracticeForm } from "./practice-form";
import { PathEmpty } from "@/components/brand/path-empty";
import { PageHeader, Panel } from "@/components/page-section";

export const metadata: Metadata = { title: "Practice" };
export const maxDuration = 60;

export default async function PracticePage() {
  const user = await requireUser();
  const [classes, recent, usage] = await Promise.all([
    db.class.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.assessment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, topic: true, subject: true, estimateLow: true, estimateHigh: true, confidence: true, createdAt: true, source: true },
    }),
    getUsageSummary(user.id),
  ]);
  const allowance = usage.features.find((feature) => feature.feature === "photo_assessment")!;
  const checksLeft = Math.max(0, allowance.limit - allowance.used);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Practice"
        description={
          <>
            Snap a photo of worked problems or type your answers. Rushd checks each answer, shows what you&apos;ve got down and
            what&apos;s missing, and tells you what to study next.
          </>
        }
      />

      {aiEnabled ? (
        <Panel
          id="new-check"
          title="New check"
          aside={
            <span className="text-xs text-muted-foreground tabular-nums">
              {checksLeft} of {allowance.limit} checks left this month
            </span>
          }
        >
          <PracticeForm classes={classes} />
        </Panel>
      ) : (
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-4 text-sm text-muted-foreground sm:px-5">
          <p>Practice checks aren&apos;t available on this server yet.</p>
          {classes.length > 0 && (
            <p className="mt-1">
              You can still practice with your own questions in each course: open a course from{" "}
              <Link href="/courses" className="text-foreground underline underline-offset-4">Courses</Link> and choose Practice.
            </p>
          )}
        </div>
      )}

      <Panel id="history" title="Your checks">
        {recent.length === 0 ? (
          <PathEmpty title="No checks yet" className="py-4">
            Each one adds evidence to your{" "}
            <Link href="/mastery" className="underline underline-offset-4">mastery</Link> picture. One check is a snapshot; a few
            over time show a trend.
          </PathEmpty>
        ) : (
          <ul className="-mx-2 divide-y divide-border">
            {recent.map((check) => (
              <li key={check.id}>
                <Link href={`/practice/${check.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/60">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{check.topic}</span>
                    <span className="block text-xs text-muted-foreground">
                      {check.subject} · {check.source === "photo" ? "Photo" : "Typed"} · {formatDateInZone(check.createdAt, user.profile?.timezone, { month: "short", day: "numeric" })}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-lg leading-none tabular-nums">
                      {Math.round(check.estimateLow)}–{Math.round(check.estimateHigh)}%
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{check.confidence} confidence</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
