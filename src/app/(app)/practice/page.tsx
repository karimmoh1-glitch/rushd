import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { getUsageSummary } from "@/lib/ai/usage";
import { formatDateInZone } from "@/lib/time/zone";
import { PracticeForm } from "./practice-form";
import { PathEmpty } from "@/components/brand/path-empty";

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
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Practice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Snap a photo of worked problems or type your answers. Rushd checks each answer, shows what you&apos;ve got down and
          what&apos;s missing, and tells you what to study next.
        </p>
      </header>

      {aiEnabled ? (
        <section aria-labelledby="new-check" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="new-check" className="text-base font-semibold">New check</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {checksLeft} of {allowance.limit} checks left this month
            </span>
          </div>
          <PracticeForm classes={classes} />
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Practice checks aren&apos;t available on this server yet.
        </p>
      )}

      <section aria-labelledby="history">
        <h2 id="history" className="border-b border-border pb-2 text-base font-semibold">Your checks</h2>
        {recent.length === 0 ? (
          <PathEmpty title="No checks yet">
            Each one adds evidence to your{" "}
            <Link href="/mastery" className="underline underline-offset-4">mastery</Link> picture. One check is a snapshot; a few
            over time show a trend.
          </PathEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((check) => (
              <li key={check.id}>
                <Link href={`/practice/${check.id}`} className="-mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-3 hover:bg-muted/60">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{check.topic}</span>
                    <span className="block text-xs text-muted-foreground">
                      {check.subject} · {check.source === "photo" ? "Photo" : "Typed"} · {formatDateInZone(check.createdAt, user.profile?.timezone, { month: "short", day: "numeric" })}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(check.estimateLow)}–{Math.round(check.estimateHigh)}% · {check.confidence} confidence
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
