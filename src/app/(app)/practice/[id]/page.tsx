import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageSquareText, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { AssessmentResultSchema } from "@/lib/practice/assessment";
import { getMastery } from "@/lib/practice/load";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { ScheduleReviewButton } from "../../mastery/schedule-review-button";
import { DeleteAssessmentButton } from "./delete-assessment-button";

export const metadata: Metadata = { title: "Practice result" };

const VERDICT: Record<string, { label: string; className: string }> = {
  correct: { label: "Correct", className: "text-success" },
  partially_correct: { label: "Partly", className: "text-warning" },
  incorrect: { label: "Missed", className: "text-destructive" },
  unclear: { label: "Unclear", className: "text-muted-foreground" },
};

const CONFIDENCE_NOTE = {
  low: "Based on only a few answers, so treat it as a rough first read.",
  medium: "A reasonable read from this check; more checks will sharpen it.",
  high: "Based on many answers in this check.",
};

export default async function PracticeResultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await db.assessment.findFirst({ where: { id, userId: user.id }, select: { id: true, topicKey: true, createdAt: true, result: true } });
  if (!row) notFound();
  const parsed = AssessmentResultSchema.safeParse(row.result);
  if (!parsed.success) notFound();
  const r = parsed.data;
  const topic = (await getMastery(user.id)).find((t) => t.topicKey === row.topicKey);
  const ask = encodeURIComponent(
    r.gaps[0] ? `Help me with ${r.gaps[0].concept}. In a practice check on ${r.topic} I got this wrong: ${r.gaps[0].evidence}` : `Quiz me on ${r.topic}.`,
  );
  const videos = r.resources.filter((x) => x.kind === "video");
  const searches = r.resources.filter((x) => x.kind === "search");

  return (
    <article className="max-w-3xl space-y-8">
      <header className="space-y-1">
        <Link href="/practice" className="text-sm text-muted-foreground hover:text-foreground">Practice</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{r.topic}</h1>
        <p className="text-sm text-muted-foreground">
          {r.subject} · {formatDateInZone(row.createdAt, user.profile?.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {r.gradable} answer{r.gradable === 1 ? "" : "s"} checked
        </p>
      </header>

      <section aria-labelledby="estimate" className="rounded-xl border border-border bg-card p-5">
        <h2 id="estimate" className="text-sm font-medium text-muted-foreground">Estimate from this check</h2>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
          {r.low === r.high ? `${r.estimate}%` : `${r.low}–${r.high}%`}
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="relative h-full" style={{ marginLeft: `${r.low}%`, width: `${Math.max(2, r.high - r.low)}%` }}>
            <div className="h-full rounded-full bg-primary/70" />
          </div>
        </div>
        <p className="mt-3 text-sm">{r.summary}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {CONFIDENCE_NOTE[r.confidence]} An AI estimate, not a grade.
          {topic && topic.evidenceCount > 1 && ` Across ${topic.evidenceCount} checks, your ${r.topic} estimate is about ${topic.estimate}%.`}
        </p>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="strong">
          <h2 id="strong" className="text-sm font-semibold">Strongest skill</h2>
          <p className="mt-1 text-sm">{r.strongestSkill || "Not enough evidence yet."}</p>
        </section>
        <section aria-labelledby="gaps">
          <h2 id="gaps" className="text-sm font-semibold">What to work on</h2>
          {r.gaps.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No clear gaps in this check.</p>
          ) : (
            <ul className="mt-1 space-y-2 text-sm">
              {r.gaps.map((g) => (
                <li key={g.concept}>
                  <span className="font-medium">{g.concept}</span>
                  {g.prerequisite && <span className="text-muted-foreground"> · builds on {g.prerequisite}</span>}
                  <p className="text-xs text-muted-foreground">{g.evidence}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="next" className="space-y-3">
        <h2 id="next" className="border-b border-border pb-2 text-base font-semibold">Next steps</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {r.nextActions.map((a) => <li key={a}>{a}</li>)}
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/tutor?ask=${ask}`} className={buttonVariants()}>
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            Work through it with the tutor
          </Link>
          {topic && topic.status !== "strong" && <ScheduleReviewButton topicKey={topic.topicKey} />}
        </div>
      </section>

      {r.practice.length > 0 && (
        <section aria-labelledby="practice">
          <h2 id="practice" className="border-b border-border pb-2 text-base font-semibold">Try these</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {r.practice.map((q) => (
              <li key={q.question}>
                {q.question}
                <span className="block text-xs text-muted-foreground">{q.concept}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.resources.length > 0 && (
        <section aria-labelledby="resources" className="space-y-3">
          <h2 id="resources" className="border-b border-border pb-2 text-base font-semibold">Learn more</h2>
          {videos.length > 0 && (
            <ul className="space-y-2">
              {videos.map((v) => (
                <li key={v.url}>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="group flex items-baseline gap-2 text-sm">
                    <span className="font-medium underline-offset-4 group-hover:underline">{v.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="(opens YouTube)" />
                  </a>
                  <p className="text-xs text-muted-foreground">{v.source}{v.durationLabel ? ` · ${v.durationLabel}` : ""} · video confirmed via YouTube · for {v.concept}</p>
                </li>
              ))}
            </ul>
          )}
          <ul className="flex flex-wrap gap-2">
            {searches.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {videos.length ? "Videos are from established education channels and confirmed to exist. " : ""}
            Search links open a search on that site; Rushd hasn&apos;t vetted the individual results.
          </p>
        </section>
      )}

      <section aria-labelledby="items">
        <h2 id="items" className="border-b border-border pb-2 text-base font-semibold">Answer by answer</h2>
        <ul className="divide-y divide-border">
          {r.items.map((item, i) => (
            <li key={`${item.label}-${i}`} className="flex gap-3 py-2.5 text-sm">
              <span className={`w-16 shrink-0 font-medium ${VERDICT[item.verdict]?.className ?? ""}`}>{VERDICT[item.verdict]?.label ?? item.verdict}</span>
              <span className="min-w-0">
                <span className="font-medium">{item.label}</span>
                {item.note && <span className="text-muted-foreground"> · {item.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="flex justify-end">
        <DeleteAssessmentButton id={row.id} />
      </footer>
    </article>
  );
}
