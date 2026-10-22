import { aiEnabled } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { resolveTimeZone } from "@/lib/time/zone";
import { AssignmentRow } from "./assignment-row";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { pulseOf } from "@/lib/planning/pulse";
import { AddAssignmentButton } from "./add-assignment-button";

export const metadata: Metadata = {
  title: "Assignments",
};

export default async function AssignmentsPage() {
  const user = await requireUser();

  const [classes, assignments, plan] = await Promise.all([
    db.class.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.assignment.findMany({
      where: { userId: user.id },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        classId: true,
        title: true,
        dueAt: true,
        estimatedMinutes: true,
        priority: true,
        status: true,
        notes: true,
        source: true,
        canvasUrl: true,
        estimatedByRushd: true,
        canvasRemovedAt: true,
        class: { select: { name: true, color: true } },
      },
    }),
    generatePlanForUser(user.id),
  ]);
  const pulseById = new Map(plan.scored.map((s) => [s.item.id, pulseOf(s.score)]));
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const toRow = (a: (typeof assignments)[number]) => ({
    id: a.id,
    classId: a.classId,
    title: a.title,
    dueAt: a.dueAt.toISOString(),
    estimatedMinutes: a.estimatedMinutes,
    priority: a.priority,
    status: a.status,
    notes: a.notes ?? undefined,
    className: a.class.name,
    classColor: a.class.color,
    source: a.source,
    canvasUrl: a.canvasUrl,
    estimatedByRushd: a.estimatedByRushd,
    canvasRemoved: a.canvasRemovedAt !== null,
    pulse: pulseById.get(a.id) ?? null,
  });

  // Open work is ranked by Pulse (the planner's order), deadline breaking ties.
  const active = assignments
    .filter((a) => a.status !== "COMPLETED" && !a.canvasRemovedAt)
    .sort((x, y) => (pulseById.get(y.id) ?? 0) - (pulseById.get(x.id) ?? 0) || x.dueAt.getTime() - y.dueAt.getTime());
  const removed = assignments.filter((a) => a.status !== "COMPLETED" && a.canvasRemovedAt);
  const completed = assignments.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked by Pulse: how strongly each one needs you right now. Open one for its instructions, rubric, and draft feedback.
          </p>
          <nav aria-label="Work" className="mt-3 flex gap-4 text-sm">
            <span aria-current="page" className="font-medium">Assignments</span>
            <Link href="/exams" className="text-muted-foreground hover:text-foreground">Exams</Link>
            {aiEnabled && <Link href="/import" className="text-muted-foreground hover:text-foreground">Import from a screenshot</Link>}
          </nav>
        </div>
        <AddAssignmentButton classes={classes} />
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">Add a course first.</p>
          <Link
            href="/courses"
            className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4"
          >
            Go to Classes
          </Link>
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="font-medium">Your workload starts here.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Connect Canvas to import every assignment and due date automatically{aiEnabled ? ", or upload a screenshot of your calendar" : ", or add one by hand"}.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/integrations/canvas"
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Connect Canvas
            </Link>
            {aiEnabled && (
              <Link
                href="/import"
                className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Upload screenshot
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((a) => (
            <AssignmentRow
              key={a.id}
              classes={classes}
              data={toRow(a)}
                timeZone={timeZone}
            />
          ))}
        </div>
      )}

      {removed.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">No longer in Canvas</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Canvas stopped listing these (deleted, unpublished, or the due date was removed). They&apos;re
            kept here but left out of your plan. Delete them if you don&apos;t need them.
          </p>
          <div className="space-y-3">
            {removed.map((a) => (
              <AssignmentRow key={a.id} classes={classes} data={toRow(a)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Completed
          </h2>
          <div className="space-y-3">
            {completed.map((a) => (
              <AssignmentRow
                key={a.id}
                classes={classes}
                data={toRow(a)}
                timeZone={timeZone}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
