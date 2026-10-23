"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteDraftReview } from "@/server/actions/course";
import type { ReviewResult } from "@/lib/review/draft-review";

interface ReviewView {
  id: string;
  label: string;
  createdLabel: string;
  result: ReviewResult;
}

type Criterion = ReviewResult["criteria"][number];

/** "7" when both ends match, otherwise "6–8". */
function range(low: number, high: number) {
  if (low === high) return `${low}`;
  return `${low}–${high}`;
}

function midpoint(criterion: { low: number; high: number }) {
  return (criterion.low + criterion.high) / 2;
}

/** How much this criterion's score moved since the previous review, or null if it can't be compared. */
function changeSincePrevious(criterion: Criterion, previous: ReviewResult | undefined): number | null {
  const before = previous?.criteria.find((old) => old.id === criterion.id && old.assessed);
  if (!before || !criterion.assessed) return null;
  return midpoint(criterion) - midpoint(before);
}

function CriterionRow({ criterion, previous }: { criterion: Criterion; previous: ReviewResult | undefined }) {
  const delta = changeSincePrevious(criterion, previous);
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{criterion.description}</h4>
        <span className="font-mono text-sm tabular-nums">
          {criterion.assessed ? `${range(criterion.low, criterion.high)} / ${criterion.points}` : `not assessed / ${criterion.points}`}
          {delta !== null && Math.abs(delta) >= 0.5 && (
            <span className={delta > 0 ? "ml-2 text-success" : "ml-2 text-destructive"}>
              {delta > 0 ? "▲" : "▼"} vs previous
            </span>
          )}
        </span>
      </div>
      {criterion.working && <p className="text-sm"><span className="text-muted-foreground">Working: </span>{criterion.working}</p>}
      {criterion.toImprove && <p className="text-sm"><span className="text-muted-foreground">Improve: </span>{criterion.toImprove}</p>}
      {criterion.evidence.length > 0 && (
        <ul className="space-y-1">
          {criterion.evidence.map((quote) => (
            <li key={quote} className="border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
              “{quote}”
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Saved reviews, newest first. The newest is compared with the one before it
 * criterion by criterion, so a revision's effect is visible. */
export function ReviewList({ reviews }: { reviews: ReviewView[] }) {
  const [pending, startTransition] = useTransition();
  if (reviews.length === 0) return null;
  const previous = reviews[1]?.result;

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteDraftReview(id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Review and draft deleted.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {reviews.map((review, index) => {
        const result = review.result;
        // Only the newest review is compared with the one before it.
        const compareWith = index === 0 ? previous : undefined;
        return (
          <details key={review.id} open={index === 0} className="rounded-lg border border-border bg-background/40">
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span className="font-medium">{review.label}</span>
              <span className="text-sm text-muted-foreground">
                AI estimate {range(result.estimateLow, result.estimateHigh)} of {result.totalPoints} · {review.createdLabel}
              </span>
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
              <p className="text-sm">{result.summary}</p>
              {result.nextSteps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Revise next</h3>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
                    {result.nextSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              <ul className="divide-y divide-border">
                {result.criteria.map((criterion) => (
                  <CriterionRow key={criterion.id} criterion={criterion} previous={compareWith} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  An estimate from {result.model}, checked against the rubric; quotes are verified to appear in your draft
                  {result.droppedQuotes > 0 ? ` (${result.droppedQuotes} unverifiable quote${result.droppedQuotes === 1 ? "" : "s"} removed)` : ""}.
                </span>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(review.id)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
