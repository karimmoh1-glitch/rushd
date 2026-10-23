import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getMastery } from "@/lib/practice/load";
import { nextReview, type TopicMastery } from "@/lib/practice/mastery";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { ScheduleReviewButton } from "./schedule-review-button";
import { PathEmpty } from "@/components/brand/path-empty";

export const metadata: Metadata = { title: "Mastery" };

const STATUS_LABEL = { needs_review: "Needs review", developing: "Developing", strong: "Strong" } as const;
const STATUS_ORDER = ["needs_review", "developing", "strong"] as const;

const TREND_DISPLAY = {
  up: { Icon: ArrowUpRight, label: "Improving" },
  down: { Icon: ArrowDownRight, label: "Slipping" },
  steady: { Icon: Minus, label: "Steady" },
};

function barColor(status: TopicMastery["status"]): string {
  if (status === "needs_review") return "bg-signal";
  if (status === "strong") return "bg-teal";
  return "bg-foreground/55";
}

function Trend({ trend }: { trend: TopicMastery["trend"] }) {
  if (!trend) return null;
  const { Icon, label } = TREND_DISPLAY[trend];
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function TopicRow({ topic, timeZone }: { topic: TopicMastery; timeZone: string | null | undefined }) {
  const lastChecked = formatDateInZone(topic.lastAssessed, timeZone, { month: "short", day: "numeric" });
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{topic.topicLabel}</p>
        <p className="text-xs text-muted-foreground">
          {topic.evidenceCount} check{topic.evidenceCount === 1 ? "" : "s"} · last {lastChecked} · {topic.confidence} confidence
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm tabular-nums">{topic.low}–{topic.high}%</p>
        <Trend trend={topic.trend} />
      </div>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Estimated ${topic.low} to ${topic.high} percent`}>
        <div className={`h-full rounded-full ${barColor(topic.status)}`} style={{ marginLeft: `${topic.low}%`, width: `${Math.max(2, topic.high - topic.low)}%` }} />
      </div>
    </li>
  );
}

function TopicGroup({
  status,
  topics,
  timeZone,
}: {
  status: TopicMastery["status"];
  topics: TopicMastery[];
  timeZone: string | null | undefined;
}) {
  if (topics.length === 0) return null;
  return (
    <section aria-labelledby={`g-${status}`}>
      <h2 id={`g-${status}`} className="border-b border-border pb-2 text-base font-semibold">
        {STATUS_LABEL[status]} <span className="font-normal text-muted-foreground">· {topics.length}</span>
      </h2>
      <ul className="divide-y divide-border">
        {topics.map((topic) => (
          <TopicRow key={topic.topicKey} topic={topic} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  );
}

export default async function MasteryPage() {
  const user = await requireUser();
  const topics = await getMastery(user.id);
  const focus = nextReview(topics);

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Mastery</h1>
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
        <PathEmpty title="No evidence yet">
          <p>
            Check a page of practice work and Rushd starts mapping what you&apos;ve mastered and what to review. Nothing here
            is guessed: every number comes from your own checks.
          </p>
          <Link href="/practice" className={`${buttonVariants()} mt-4`}>Check my work</Link>
        </PathEmpty>
      ) : (
        <>
          {focus && (
            <section aria-labelledby="focus" className="rounded-xl border border-border bg-card p-5">
              <h2 id="focus" className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
                Study next
              </h2>
              <p className="mt-1.5 font-display text-2xl font-medium tracking-tight">{focus.topicLabel}</p>
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

          {STATUS_ORDER.map((status) => (
            <TopicGroup
              key={status}
              status={status}
              topics={topics.filter((topic) => topic.status === status)}
              timeZone={user.profile?.timezone}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            Estimates are AI judgments of short checks, not grades. They weigh recent evidence more (half-life about a month)
            and widen when evidence is thin.
          </p>
        </>
      )}
    </div>
  );
}
