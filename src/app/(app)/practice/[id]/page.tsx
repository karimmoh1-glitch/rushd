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
import { PageHeader, Panel } from "@/components/page-section";

export const metadata: Metadata = { title: "Practice result" };

const VERDICT: Record<string, { label: string; className: string }> = {
  correct: { label: "Correct", className: "bg-done/12 text-done ring-done/25" },
  partially_correct: { label: "Partly", className: "bg-soon/12 text-soon ring-soon/25" },
  incorrect: { label: "Missed", className: "bg-overdue/12 text-overdue ring-overdue/25" },
  unclear: { label: "Unclear", className: "bg-muted text-muted-foreground ring-border" },
};

const CONFIDENCE_NOTE = {
  low: "Based on only a few answers, so treat it as a rough first read.",
  medium: "A reasonable read from this check; more checks will sharpen it.",
  high: "Based on many answers in this check.",
};

/** "72%" when the range is a single number, otherwise "65–80%". */
function estimateText(result: { low: number; high: number; estimate: number }): string {
  if (result.low === result.high) return `${result.estimate}%`;
  return `${result.low}–${result.high}%`;
}

/** Below 60% is highlighted, 80% and up is teal, anything between is neutral. */
function estimateBarColor(estimate: number): string {
  if (estimate < 60) return "bg-signal";
  if (estimate >= 80) return "bg-teal";
  return "bg-foreground/55";
}

/** What "Work through it with the tutor" asks: about the first gap, or a quiz if there were none. */
function tutorQuestion(result: { topic: string; gaps: { concept: string; evidence: string }[] }): string {
  const firstGap = result.gaps[0];
  if (firstGap) {
    return `Help me with ${firstGap.concept}. In a practice check on ${result.topic} I got this wrong: ${firstGap.evidence}`;
  }
  return `Quiz me on ${result.topic}.`;
}

export default async function PracticeResultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await db.assessment.findFirst({ where: { id, userId: user.id }, select: { id: true, topicKey: true, createdAt: true, result: true } });
  if (!row) notFound();
  const parsed = AssessmentResultSchema.safeParse(row.result);
  if (!parsed.success) notFound();
  const result = parsed.data;
  const mastery = await getMastery(user.id);
  const topic = mastery.find((entry) => entry.topicKey === row.topicKey);
  const ask = encodeURIComponent(tutorQuestion(result));
  const videos = result.resources.filter((resource) => resource.kind === "video");
  const searches = result.resources.filter((resource) => resource.kind === "search");

  return (
    <article className="max-w-3xl space-y-6">
      <PageHeader
        back={{ href: "/practice", label: "Practice" }}
        title={result.topic}
        description={
          <>
            {result.subject} · {formatDateInZone(row.createdAt, user.profile?.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {result.gradable} answer{result.gradable === 1 ? "" : "s"} checked
          </>
        }
      />

      <section aria-labelledby="estimate" className="rounded-xl bg-card px-4 py-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-6">
        <h2 id="estimate" className="text-sm font-medium text-muted-foreground">Estimate from this check</h2>
        <p className="mt-1 font-display text-5xl font-medium tabular-nums tracking-tight">
          {estimateText(result)}
        </p>
        <div className="relative mt-4" aria-hidden="true">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="relative h-full" style={{ marginLeft: `${result.low}%`, width: `${Math.max(2, result.high - result.low)}%` }}>
              <div className={`h-full rounded-full ${estimateBarColor(result.estimate)}`} />
            </div>
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">{result.summary}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {CONFIDENCE_NOTE[result.confidence]} An AI estimate, not a grade.
          {topic && topic.evidenceCount > 1 && ` Across ${topic.evidenceCount} checks, your ${result.topic} estimate is about ${topic.estimate}%.`}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel id="strong" title="Strongest skill" className="h-full">
          <p className="text-sm">{result.strongestSkill || "Not enough evidence yet."}</p>
        </Panel>
        <Panel id="gaps" title="What to work on" className="h-full">
          {result.gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clear gaps in this check.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {result.gaps.map((gap) => (
                <li key={gap.concept}>
                  <span className="font-medium">{gap.concept}</span>
                  {gap.prerequisite && <span className="text-muted-foreground"> · builds on {gap.prerequisite}</span>}
                  <p className="text-xs text-muted-foreground">{gap.evidence}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel id="next" title="Next steps">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {result.nextActions.map((action) => <li key={action}>{action}</li>)}
        </ol>
        <div className="flex flex-wrap gap-2 pt-4">
          <Link href={`/tutor?ask=${ask}`} className={buttonVariants()}>
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            Work through it with the tutor
          </Link>
          {topic && topic.status !== "strong" && <ScheduleReviewButton topicKey={topic.topicKey} />}
        </div>
      </Panel>

      {result.practice.length > 0 && (
        <Panel id="practice" title="Try these">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {result.practice.map((problem) => (
              <li key={problem.question}>
                {problem.question}
                <span className="block text-xs text-muted-foreground">{problem.concept}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {result.resources.length > 0 && (
        <Panel id="resources" title="Learn more">
          <div className="space-y-3">
            {videos.length > 0 && (
              <ul className="space-y-2">
                {videos.map((video) => (
                  <li key={video.url}>
                    <a href={video.url} target="_blank" rel="noopener noreferrer" className="group flex items-baseline gap-2 text-sm">
                      <span className="font-medium underline-offset-4 group-hover:underline">{video.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="(opens YouTube)" />
                    </a>
                    <p className="text-xs text-muted-foreground">{video.source}{video.durationLabel ? ` · ${video.durationLabel}` : ""} · video confirmed via YouTube · for {video.concept}</p>
                  </li>
                ))}
              </ul>
            )}
            <ul className="flex flex-wrap gap-2">
              {searches.map((search) => (
                <li key={search.url}>
                  <a href={search.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    {search.title}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {videos.length ? "Videos are from established education channels and confirmed to exist. " : ""}
              Search links open a search on that site; Rushd hasn&apos;t vetted the individual results.
            </p>
          </div>
        </Panel>
      )}

      <Panel id="items" title="Answer by answer">
        <ul className="divide-y divide-border">
          {result.items.map((item, index) => {
            const verdict = VERDICT[item.verdict];
            return (
              <li key={`${item.label}-${index}`} className="flex items-start gap-3 py-2.5 text-sm">
                <span
                  className={`mt-px inline-flex h-5 w-16 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ring-1 ring-inset ${verdict?.className ?? "bg-muted text-muted-foreground ring-border"}`}
                >
                  {verdict?.label ?? item.verdict}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{item.label}</span>
                  {item.note && <span className="text-muted-foreground"> · {item.note}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <footer className="flex justify-end border-t border-border pt-4">
        <DeleteAssessmentButton id={row.id} />
      </footer>
    </article>
  );
}
