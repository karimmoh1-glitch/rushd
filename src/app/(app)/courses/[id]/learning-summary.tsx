import Link from "next/link";
import type { CourseLearning } from "@/lib/learning/load";
import type { MasteryStatusV2 } from "@/lib/learning/estimator";
import { buttonVariants } from "@/components/ui/button";
import { MasteryChip } from "@/components/learning/mastery-chip";
import { StartPracticeButton } from "@/components/learning/start-practice-button";

const ORDER: MasteryStatusV2[] = ["needs_review", "developing", "secure", "not_enough_evidence"];

/** The course overview's learning panel: where the student stands and what's due. */
export function LearningSummary({ courseId, learning }: { courseId: string; learning: CourseLearning }) {
  const counts = new Map<MasteryStatusV2, number>();
  for (const t of learning.topics) counts.set(t.estimate.status, (counts.get(t.estimate.status) ?? 0) + 1);
  const gap = learning.topics.find((t) => t.remediation);
  return (
    <section aria-labelledby="learning-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 id="learning-heading" className="text-base font-semibold">
          Learning
        </h2>
        <Link href={`/courses/${courseId}/topics`} className="text-sm text-muted-foreground hover:text-foreground">
          All topics
        </Link>
      </div>
      {learning.topics.length === 0 ? (
        <div className="py-4 text-sm text-muted-foreground">
          <p>
            Add the topics this course covers and Rushd tracks, from your own practice, what you&apos;ve got down and what to review.
            {learning.proposed.length > 0 && ` ${learning.proposed.length} suggested topic${learning.proposed.length === 1 ? " is" : "s are"} waiting for you to confirm.`}
          </p>
          <Link href={`/courses/${courseId}/topics`} className={`${buttonVariants({ variant: "outline" })} mt-3`}>
            {learning.proposed.length > 0 ? "Review topics" : "Add topics"}
          </Link>
        </div>
      ) : (
        <div className="space-y-4 pt-3">
          <p className="flex flex-wrap gap-2" aria-label="Topics by status">
            {ORDER.filter((s) => counts.get(s)).map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-sm">
                <MasteryChip status={status} />
                <span className="tabular-nums text-muted-foreground">{counts.get(status)}</span>
              </span>
            ))}
          </p>
          {learning.review.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Due for review</h3>
              <ul className="mt-1 divide-y divide-border">
                {learning.review.slice(0, 3).map((item) => (
                  <li key={item.topicId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">{item.reason}</span>
                    </span>
                    <StartPracticeButton classId={courseId} topicId={item.topicId} mode="review" label="Review" size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gap?.remediation && (
            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
              <span className="font-medium">Stuck on {gap.title}?</span>{" "}
              <span className="text-muted-foreground">{gap.remediation.reason}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
