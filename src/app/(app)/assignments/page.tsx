import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { resolveTimeZone } from "@/lib/time/zone";
import { AssignmentRow } from "./assignment-row";
import { AddAssignmentButton } from "./add-assignment-button";

export const metadata: Metadata = {
  title: "Assignments",
};

export default async function AssignmentsPage() {
  const user = await requireUser();

  const [classes, assignments] = await Promise.all([
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
  ]);
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
  });

  const active = assignments.filter((a) => a.status !== "COMPLETED" && !a.canvasRemovedAt);
  const removed = assignments.filter((a) => a.status !== "COMPLETED" && a.canvasRemovedAt);
  const completed = assignments.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything due, ordered by deadline.
          </p>
        </div>
        <AddAssignmentButton classes={classes} />
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">Add a class first.</p>
          <Link
            href="/classes"
            className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4"
          >
            Go to Classes
          </Link>
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="font-medium">Your workload starts here.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Connect Canvas to import every assignment and due date automatically, or upload a
            screenshot of your calendar.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/integrations/canvas"
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Connect Canvas
            </Link>
            <Link
              href="/import"
              className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Upload screenshot
            </Link>
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
