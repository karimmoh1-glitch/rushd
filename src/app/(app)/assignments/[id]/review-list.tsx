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

function range(low: number, high: number) {
  return low === high ? `${low}` : `${low}–${high}`;
}

function midpoint(c: { low: number; high: number }) {
  return (c.low + c.high) / 2;
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
      if ("error" in result) toast.error(result.error);
      else toast.success("Review and draft deleted.");
    });
  }

  return (
    <div className="space-y-4">
      {reviews.map((review, index) => {
        const r = review.result;
        const compareWith = index === 0 ? previous : undefined;
        return (
          <details key={review.id} open={index === 0} className="rounded-lg border border-border">
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span className="font-medium">{review.label}</span>
              <span className="text-sm text-muted-foreground">
                AI estimate {range(r.estimateLow, r.estimateHigh)} of {r.totalPoints} · {review.createdLabel}
              </span>
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
              <p className="text-sm">{r.summary}</p>
              {r.nextSteps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Revise next</h3>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
                    {r.nextSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
              <ul className="divide-y divide-border">
                {r.criteria.map((c) => {
                  const before = compareWith?.criteria.find((p) => p.id === c.id && p.assessed);
                  const delta = before && c.assessed ? midpoint(c) - midpoint(before) : null;
                  return (
                    <li key={c.id} className="space-y-1.5 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-sm font-medium">{c.description}</h4>
                        <span className="font-mono text-sm tabular-nums">
                          {c.assessed ? `${range(c.low, c.high)} / ${c.points}` : `not assessed / ${c.points}`}
                          {delta !== null && Math.abs(delta) >= 0.5 && (
                            <span className={delta > 0 ? "ml-2 text-success" : "ml-2 text-destructive"}>
                              {delta > 0 ? "▲" : "▼"} vs previous
                            </span>
                          )}
                        </span>
                      </div>
                      {c.working && <p className="text-sm"><span className="text-muted-foreground">Working: </span>{c.working}</p>}
                      {c.toImprove && <p className="text-sm"><span className="text-muted-foreground">Improve: </span>{c.toImprove}</p>}
                      {c.evidence.length > 0 && (
                        <ul className="space-y-1">
                          {c.evidence.map((q) => (
                            <li key={q} className="border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                              “{q}”
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  An estimate from {r.model}, checked against the rubric; quotes are verified to appear in your draft
                  {r.droppedQuotes > 0 ? ` (${r.droppedQuotes} unverifiable quote${r.droppedQuotes === 1 ? "" : "s"} removed)` : ""}.
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
