import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getMastery } from "@/lib/practice/load";
import { nextReview, type TopicMastery } from "@/lib/practice/mastery";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { ScheduleReviewButton } from "./schedule-review-button";

export const metadata: Metadata = { title: "Mastery" };

const STATUS_LABEL = { needs_review: "Needs review", developing: "Developing", strong: "Strong" } as const;

function Trend({ trend }: { trend: TopicMastery["trend"] }) {
  if (!trend) return null;
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const label = trend === "up" ? "Improving" : trend === "down" ? "Slipping" : "Steady";
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export default async function MasteryPage() {
  const user = await requireUser();
  const topics = await getMastery(user.id);
  const focus = nextReview(topics);
  const groups = (["needs_review", "developing", "strong"] as const).map((s) => ({ status: s, topics: topics.filter((t) => t.status === s) }));

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mastery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What your practice checks show you know, topic by topic. Estimates come with a range and get more reliable with
          every check; recent work counts more.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/mastery/habits" className="underline underline-offset-4">Study habits</Link>
          <Link href="/profile" className="underline underline-offset-4">Academic profile</Link>
        </p>
      </header>

      {topics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6">
          <p className="font-medium">No evidence yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check a page of practice work and Rushd starts mapping what you&apos;ve mastered and what to review. Nothing here
            is guessed: every number comes from your own checks.
          </p>
          <Link href="/practice" className={`${buttonVariants()} mt-4`}>Check my work</Link>
        </div>
      ) : (
        <>
          {focus && (
            <section aria-labelledby="focus" className="rounded-xl border border-border bg-card p-5">
              <h2 id="focus" className="text-sm font-medium text-muted-foreground">Study next</h2>
              <p className="mt-1 text-xl font-semibold tracking-tight">{focus.topicLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                About {focus.estimate}% (range {focus.low}–{focus.high}%, {focus.confidence} confidence) from {focus.evidenceCount} check
                {focus.evidenceCount === 1 ? "" : "s"}.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/tutor?ask=${encodeURIComponent(`Help me review ${focus.topicLabel}. Start with a quick diagnostic question.`)}`} className={buttonVariants()}>
                  Review with the tutor
                </Link>
                <ScheduleReviewButton topicKey={focus.topicKey} />
                <Link href="/practice" className={buttonVariants({ variant: "ghost" })}>Check again</Link>
              </div>
            </section>
          )}

          {groups.map((g) =>
            g.topics.length === 0 ? null : (
              <section key={g.status} aria-labelledby={`g-${g.status}`}>
                <h2 id={`g-${g.status}`} className="border-b border-border pb-2 text-base font-semibold">
                  {STATUS_LABEL[g.status]} <span className="font-normal text-muted-foreground">· {g.topics.length}</span>
                </h2>
                <ul className="divide-y divide-border">
                  {g.topics.map((t) => (
                    <li key={t.topicKey} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.topicLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.evidenceCount} check{t.evidenceCount === 1 ? "" : "s"} · last {formatDateInZone(t.lastAssessed, user.profile?.timezone, { month: "short", day: "numeric" })} · {t.confidence} confidence
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular-nums">{t.low}–{t.high}%</p>
                        <Trend trend={t.trend} />
                      </div>
                      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Estimated ${t.low} to ${t.high} percent`}>
                        <div className="h-full rounded-full bg-primary/70" style={{ marginLeft: `${t.low}%`, width: `${Math.max(2, t.high - t.low)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
          <p className="text-xs text-muted-foreground">
            Estimates are AI judgments of short checks, not grades. They weigh recent evidence more (half-life about a month)
            and widen when evidence is thin.
          </p>
        </>
      )}
    </div>
  );
}
