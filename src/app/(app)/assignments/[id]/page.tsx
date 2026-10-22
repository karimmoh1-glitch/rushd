import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageSquareText } from "lucide-react";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { getAssignmentMaterial } from "@/lib/course/retrieval";
import { ReviewResultSchema } from "@/lib/review/draft-review";
import { formatDueDate, formatDuration } from "@/lib/format";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { RubricTable } from "@/components/course/rubric-table";
import { DraftReviewForm } from "./draft-review-form";
import { ReviewList } from "./review-list";

export const metadata: Metadata = { title: "Assignment" };
export const maxDuration = 60;

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const tz = user.profile?.timezone;
  const a = await db.assignment.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      dueAt: true,
      status: true,
      estimatedMinutes: true,
      source: true,
      canvasUrl: true,
      notes: true,
      class: { select: { id: true, name: true, color: true } },
    },
  });
  if (!a) notFound();

  const [material, reviewRows] = await Promise.all([
    getAssignmentMaterial(user.id, a.id),
    db.draftReview.findMany({
      where: { userId: user.id, assignmentId: a.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, label: true, createdAt: true, result: true },
    }),
  ]);
  const reviews = reviewRows.flatMap((r) => {
    const parsed = ReviewResultSchema.safeParse(r.result);
    return parsed.success
      ? [{ id: r.id, label: r.label, createdLabel: formatDateInZone(r.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), result: parsed.data }]
      : [];
  });

  const canvasLink = material?.url ?? a.canvasUrl;

  return (
    <div className="max-w-3xl space-y-10">
      <header className="space-y-2">
        <Link href="/assignments" className="text-sm text-muted-foreground hover:text-foreground">
          Assignments
        </Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">{a.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: a.class.color }} />
          <Link href={`/courses/${a.class.id}`} className="hover:text-foreground">{a.class.name}</Link>
          <span>· Due {formatDueDate(a.dueAt, tz)}</span>
          <span>· {formatDuration(a.estimatedMinutes)} estimated</span>
          {a.status === "COMPLETED" && <span>· Done</span>}
          {material?.pointsPossible != null && <span>· {material.pointsPossible} points</span>}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/tutor?assignmentId=${a.id}`} className={buttonVariants({ variant: "outline" })}>
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            Ask the tutor about this
          </Link>
          {canvasLink && (
            <a href={canvasLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open in Canvas
            </a>
          )}
        </div>
      </header>

      <section aria-labelledby="desc-heading" className="space-y-3">
        <h2 id="desc-heading" className="border-b border-border pb-2 text-base font-semibold">What the teacher asked for</h2>
        {material ? (
          material.body ? (
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{material.body}</div>
          ) : (
            <p className="text-sm text-muted-foreground">The Canvas assignment has no description.</p>
          )
        ) : a.source === "CANVAS" ? (
          <p className="text-sm text-muted-foreground">
            Sync this course&apos;s content on its{" "}
            <Link href={`/courses/${a.class.id}`} className="underline underline-offset-4">course page</Link> to see the description and rubric.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">You added this assignment by hand{a.notes ? `. Your notes: ${a.notes}` : ", so there's no teacher description on file."}</p>
        )}
      </section>

      <section aria-labelledby="rubric-heading" className="space-y-3">
        <h2 id="rubric-heading" className="border-b border-border pb-2 text-base font-semibold">Rubric</h2>
        {material?.rubric ? (
          <RubricTable rubric={material.rubric} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {material ? "No rubric was published in Canvas for this assignment." : "No rubric on file."} Rushd won&apos;t make one up.
          </p>
        )}
      </section>

      <section aria-labelledby="review-heading" className="space-y-4">
        <div className="border-b border-border pb-2">
          <h2 id="review-heading" className="text-base font-semibold">Draft feedback</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a draft to get criterion-by-criterion feedback against the rubric. Scores are an AI estimate shown as
            ranges; your teacher grades. Your draft is sent to Anthropic to generate the feedback and saved here so you can
            compare revisions; delete it anytime.
          </p>
        </div>
        {!material?.rubric ? (
          <p className="text-sm text-muted-foreground">Draft feedback needs a published rubric.</p>
        ) : !aiEnabled ? (
          <p className="text-sm text-muted-foreground">Draft feedback isn&apos;t available on this server yet.</p>
        ) : (
          <DraftReviewForm assignmentId={a.id} />
        )}
        <ReviewList reviews={reviews} />
      </section>
    </div>
  );
}
