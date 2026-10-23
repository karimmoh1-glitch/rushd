import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, MessageSquareText } from "lucide-react";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { getAssignmentMaterial, type MaterialDetail } from "@/lib/course/retrieval";
import { ReviewResultSchema, type ReviewResult } from "@/lib/review/draft-review";
import { dueStatus, formatDueDate, formatDuration } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { RubricTable } from "@/components/course/rubric-table";
import { DraftReviewForm } from "./draft-review-form";
import { ReviewList } from "./review-list";

export const metadata: Metadata = { title: "Assignment" };
export const maxDuration = 60;

/** The teacher's description, or why there isn't one. */
function AssignmentDescription({
  material,
  source,
  classId,
  notes,
}: {
  material: MaterialDetail | null;
  source: string;
  classId: string;
  notes: string | null;
}) {
  if (material) {
    if (material.body) {
      return <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{material.body}</div>;
    }
    return <p className="text-sm text-muted-foreground">The Canvas assignment has no description.</p>;
  }

  if (source === "CANVAS") {
    return (
      <p className="text-sm text-muted-foreground">
        Sync this course&apos;s content on its{" "}
        <Link href={`/courses/${classId}`} className="underline underline-offset-4">course page</Link> to see the description and rubric.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">You added this assignment by hand{notes ? `. Your notes: ${notes}` : ", so there's no teacher description on file."}</p>
  );
}

/** The draft form, shown only when there is a rubric to review against and AI is on. */
function DraftFeedbackForm({ hasRubric, assignmentId }: { hasRubric: boolean; assignmentId: string }) {
  if (!hasRubric) {
    return <p className="text-sm text-muted-foreground">Draft feedback needs a published rubric.</p>;
  }
  if (!aiEnabled) {
    return <p className="text-sm text-muted-foreground">Draft feedback isn&apos;t available on this server yet.</p>;
  }
  return <DraftReviewForm assignmentId={assignmentId} />;
}

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const tz = user.profile?.timezone;
  const assignment = await db.assignment.findFirst({
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
  if (!assignment) notFound();

  const [material, reviewRows] = await Promise.all([
    getAssignmentMaterial(user.id, assignment.id),
    db.draftReview.findMany({
      where: { userId: user.id, assignmentId: assignment.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, label: true, createdAt: true, result: true },
    }),
  ]);
  // Skip any saved review whose stored result no longer matches the schema.
  const reviews: { id: string; label: string; createdLabel: string; result: ReviewResult }[] = [];
  for (const row of reviewRows) {
    const parsed = ReviewResultSchema.safeParse(row.result);
    if (!parsed.success) continue;
    reviews.push({
      id: row.id,
      label: row.label,
      createdLabel: formatDateInZone(row.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      result: parsed.data,
    });
  }

  const canvasLink = material?.url ?? assignment.canvasUrl;

  const status = assignment.status === "COMPLETED" ? null : dueStatus(assignment.dueAt, tz);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-3" style={{ ["--course" as string]: assignment.class.color }}>
        <Link href="/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Assignments
        </Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight sm:text-[2rem]">{assignment.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <Link href={`/courses/${assignment.class.id}`} className="course-ink inline-flex items-center gap-1.5 font-medium hover:underline hover:underline-offset-4">
            <span aria-hidden="true" className="course-rule h-2 w-2 rounded-full" />
            {assignment.class.name}
          </Link>
          <span className="inline-flex items-center gap-2">
            {status && <StatusChip status={status} />}
            {assignment.status === "COMPLETED" && <span className="inline-flex h-5 items-center rounded-full bg-done/12 px-2 text-[11px] font-medium text-done ring-1 ring-done/25 ring-inset">Done</span>}
            <span className={status === "overdue" ? "text-overdue" : undefined}>Due {formatDueDate(assignment.dueAt, tz)}</span>
          </span>
          <span className="tabular-nums">{formatDuration(assignment.estimatedMinutes)} estimated</span>
          {material?.pointsPossible != null && <span className="tabular-nums">{material.pointsPossible} points</span>}
        </div>
        {(aiEnabled || canvasLink) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {aiEnabled && (
              <Link href={`/tutor?assignmentId=${assignment.id}`} className={buttonVariants({ variant: "outline" })}>
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                Ask the tutor about this
              </Link>
            )}
            {canvasLink && (
              <a href={canvasLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open in Canvas
              </a>
            )}
          </div>
        )}
      </header>

      <Section id="desc-heading" title="What the teacher asked for">
        <AssignmentDescription
          material={material}
          source={assignment.source}
          classId={assignment.class.id}
          notes={assignment.notes}
        />
      </Section>

      <Section id="rubric-heading" title="Rubric">
        {material?.rubric ? (
          <RubricTable rubric={material.rubric} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {material ? "No rubric was published in Canvas for this assignment." : "No rubric on file."} Rushd won&apos;t make one up.
          </p>
        )}
      </Section>

      <Section
        id="review-heading"
        title="Draft feedback"
        description="Paste a draft to get criterion-by-criterion feedback against the rubric. Scores are an AI estimate shown as ranges; your teacher grades. Your draft is sent to Anthropic to generate the feedback and saved here so you can compare revisions; delete it anytime."
      >
        <div className="space-y-4">
          <DraftFeedbackForm hasRubric={Boolean(material?.rubric)} assignmentId={assignment.id} />
          <ReviewList reviews={reviews} />
        </div>
      </Section>
    </div>
  );
}

/** One titled block of the page, on a card. */
function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-card px-4 py-4 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-5 sm:py-5">
      <div className="mb-3">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
