import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getLearningOverview, type TopicView } from "@/lib/learning/load";
import type { MasteryStatusV2, TopicEstimate } from "@/lib/learning/estimator";
import { buttonVariants } from "@/components/ui/button";
import { PathEmpty } from "@/components/brand/path-empty";
import { MasteryChip, estimateLine } from "@/components/learning/mastery-chip";
import { StartPracticeButton } from "@/components/learning/start-practice-button";
import { ScheduleReviewButton } from "./schedule-review-button";

export const metadata: Metadata = { title: "Mastery" };

const ORDER: MasteryStatusV2[] = ["needs_review", "developing", "secure", "not_enough_evidence"];
const COUNT_LABEL: Record<MasteryStatusV2, string> = {
  needs_review: "need review",
  developing: "developing",
  secure: "secure",
  not_enough_evidence: "not enough evidence",
};

function TopicLine({
  title,
  estimate,
  href,
  indent,
  children,
}: {
  title: string;
  estimate: TopicEstimate;
  href?: string;
  indent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={indent ? "py-3 pl-5" : "py-3"}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {href ? (
          <Link href={href} className="min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline">
            {title}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        )}
        <MasteryChip status={estimate.status} />
      </div>
      {estimateLine(estimate) && <p className="mt-1 text-xs text-muted-foreground">{estimateLine(estimate)}</p>}
      <p className="mt-0.5 text-sm text-muted-foreground">{estimate.explanation}</p>
      {children}
    </li>
  );
}

function countsLine(topics: TopicView[]): string {
  const counts = new Map<MasteryStatusV2, number>();
  for (const t of topics) counts.set(t.estimate.status, (counts.get(t.estimate.status) ?? 0) + 1);
  return ORDER.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${COUNT_LABEL[s]}`).join(" · ");
}

export default async function MasteryPage() {
  const user = await requireUser();
  const overview = await getLearningOverview(user.id);
  const courses = overview.courses.filter((c) => !c.archived || c.learning.topics.some((t) => t.estimate.answers > 0));
  const withTopics = courses.filter((c) => c.learning.topics.length > 0);
  const withoutTopics = courses.filter((c) => c.learning.topics.length === 0);
  const hasEvidence = withTopics.some((c) => c.learning.topics.some((t) => t.estimate.answers > 0)) || overview.unlinked.length > 0;
  const courseName = new Map(overview.courses.map((c) => [c.id, c.name]));
  const gap = withTopics.flatMap((c) => c.learning.topics.filter((t) => t.remediation).map((t) => ({ course: c, topic: t })))[0];

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Mastery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What your practice shows you know, course by course. Every status comes from your own answers and says how sure it
          can be; with little evidence, it says so.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/mastery/habits" className="underline underline-offset-4">Study habits</Link>
          <Link href="/profile" className="underline underline-offset-4">Academic profile</Link>
        </p>
      </header>

      {!hasEvidence && withTopics.length === 0 ? (
        <PathEmpty title="No evidence yet">
          <p>
            Open a course, add its topics, and practice a few questions. Rushd starts mapping what you&apos;ve mastered and
            what to review from your answers. Nothing here is guessed.
          </p>
          <Link href="/courses" className={`${buttonVariants()} mt-4`}>Go to my courses</Link>
        </PathEmpty>
      ) : (
        <>
          {overview.review.length > 0 && (
            <section aria-labelledby="due" className="rounded-xl bg-card px-4 py-4 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-5">
              <h2 id="due" className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
                Due for review
              </h2>
              <ul className="mt-2 divide-y divide-border">
                {overview.review.slice(0, 5).map((item) => (
                  <li key={item.topicId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.title} <span className="font-normal text-muted-foreground">· {courseName.get(item.classId)}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">{item.reason}</span>
                    </span>
                    <StartPracticeButton classId={item.classId} topicId={item.topicId} mode="review" label="Review" size="sm" />
                  </li>
                ))}
              </ul>
              {overview.review.length > 5 && <p className="pt-2 text-xs text-muted-foreground">And {overview.review.length - 5} more in their courses.</p>}
            </section>
          )}

          {gap?.topic.remediation && (
            <section aria-labelledby="gap" className="space-y-1">
              <h2 id="gap" className="text-base font-semibold">Biggest gap</h2>
              <p className="text-sm">
                <span className="font-medium">{gap.topic.title}</span>{" "}
                <span className="text-muted-foreground">in {gap.course.name}. {gap.topic.remediation.reason}</span>
              </p>
            </section>
          )}

          {withTopics.map((course) => (
            <section key={course.id} aria-labelledby={`course-${course.id}`} style={{ ["--course" as string]: course.color }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
                <h2 id={`course-${course.id}`} className="flex items-center gap-2 text-base font-semibold">
                  <span aria-hidden="true" className="course-rule h-2.5 w-2.5 rounded-full" />
                  <Link href={`/courses/${course.id}/topics`} className="underline-offset-4 hover:underline">
                    {course.name}
                  </Link>
                </h2>
                <span className="text-xs text-muted-foreground">{countsLine(course.learning.topics)}</span>
              </div>
              <ul className="divide-y divide-border">
                {course.learning.topics.map((topic) => (
                  <TopicLine key={topic.id} title={topic.title} estimate={topic.estimate} indent={Boolean(topic.parentId)} />
                ))}
              </ul>
            </section>
          ))}

          {overview.unlinked.length > 0 && (
            <section aria-labelledby="other-checks">
              <h2 id="other-checks" className="border-b border-border pb-2 text-base font-semibold">
                From photo checks, not yet in a topic map
              </h2>
              <p className="pt-2 text-xs text-muted-foreground">
                Add a topic with the same name to the right course and this evidence moves there.
              </p>
              <ul className="divide-y divide-border">
                {overview.unlinked.map((item) => (
                  <TopicLine
                    key={`${item.classId}:${item.key}`}
                    title={`${item.label}${item.classId && courseName.get(item.classId) ? ` · ${courseName.get(item.classId)}` : ""}`}
                    estimate={item.estimate}
                  >
                    {item.estimate.status === "needs_review" && (
                      <div className="pt-2">
                        <ScheduleReviewButton topicKey={item.key} size="sm" />
                      </div>
                    )}
                  </TopicLine>
                ))}
              </ul>
            </section>
          )}

          {withoutTopics.length > 0 && (
            <p className="text-sm text-muted-foreground">
              No topics yet in{" "}
              {withoutTopics.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && (i === withoutTopics.length - 1 ? " and " : ", ")}
                  <Link href={`/courses/${c.id}/topics`} className="underline underline-offset-4">{c.name}</Link>
                </span>
              ))}
              . Add them to track mastery there.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            How this works: answers count more when they&apos;re recent, harder, and done without hints; success in separate
            sessions counts more than many answers in one sitting; and a topic comes due for review as time passes since you
            last got it right. These are estimates from a handful of answers, not grades, and they don&apos;t know how your
            teacher grades.
          </p>
        </>
      )}
    </div>
  );
}
