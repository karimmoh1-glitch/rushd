import { aiEnabled } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { resolveTimeZone } from "@/lib/time/zone";
import { AssignmentRow, type AssignmentRowData } from "./assignment-row";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { currentTime } from "@/lib/time/now";
import { pulseOf } from "@/lib/planning/pulse";
import { AddAssignmentButton } from "./add-assignment-button";

export const metadata: Metadata = {
  title: "Assignments",
};

interface AssignmentRecord {
  id: string;
  classId: string;
  title: string;
  dueAt: Date;
  estimatedMinutes: number;
  priority: AssignmentRowData["priority"];
  status: AssignmentRowData["status"];
  notes: string | null;
  weightPercent: number | null;
  source: NonNullable<AssignmentRowData["source"]>;
  canvasUrl: string | null;
  estimatedByRushd: boolean;
  canvasRemovedAt: Date | null;
  class: { name: string; color: string };
}

/** The plain, serializable shape the client-side row needs. */
function toRowData(assignment: AssignmentRecord, pulse: number | null): AssignmentRowData {
  return {
    id: assignment.id,
    classId: assignment.classId,
    title: assignment.title,
    dueAt: assignment.dueAt.toISOString(),
    estimatedMinutes: assignment.estimatedMinutes,
    priority: assignment.priority,
    status: assignment.status,
    notes: assignment.notes ?? undefined,
    weightPercent: assignment.weightPercent,
    className: assignment.class.name,
    classColor: assignment.class.color,
    source: assignment.source,
    canvasUrl: assignment.canvasUrl,
    estimatedByRushd: assignment.estimatedByRushd,
    canvasRemoved: assignment.canvasRemovedAt !== null,
    pulse,
  };
}

function NoClassesYet() {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-muted-foreground">Add a course first.</p>
      <Link
        href="/courses"
        className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        Go to Classes
      </Link>
    </div>
  );
}

function NoAssignmentsYet() {
  return (
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
  );
}

export default async function AssignmentsPage() {
  const user = await requireUser();
  const now = await currentTime();

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
        weightPercent: true,
        source: true,
        canvasUrl: true,
        estimatedByRushd: true,
        canvasRemovedAt: true,
        class: { select: { name: true, color: true } },
      },
    }),
    generatePlanForUser(user.id, now),
  ]);
  const pulseById = new Map(plan.scored.map((scored) => [scored.item.id, pulseOf(scored.score)]));
  const timeZone = resolveTimeZone(user.profile?.timezone);
  function toRow(assignment: AssignmentRecord): AssignmentRowData {
    return toRowData(assignment, pulseById.get(assignment.id) ?? null);
  }

  // Open work is ranked by Pulse (the planner's order), deadline breaking ties.
  function byPulseThenDueDate(a: AssignmentRecord, b: AssignmentRecord): number {
    const pulseDifference = (pulseById.get(b.id) ?? 0) - (pulseById.get(a.id) ?? 0);
    if (pulseDifference !== 0) return pulseDifference;
    return a.dueAt.getTime() - b.dueAt.getTime();
  }

  const active = assignments.filter((a) => a.status !== "COMPLETED" && !a.canvasRemovedAt);
  active.sort(byPulseThenDueDate);
  const removed = assignments.filter((a) => a.status !== "COMPLETED" && a.canvasRemovedAt);
  const completed = assignments.filter((a) => a.status === "COMPLETED");

  let mainContent: React.ReactNode;
  if (classes.length === 0) {
    mainContent = <NoClassesYet />;
  } else if (assignments.length === 0) {
    mainContent = <NoAssignmentsYet />;
  } else {
    mainContent = (
      <div className="space-y-3">
        {active.map((assignment) => (
          <AssignmentRow key={assignment.id} classes={classes} data={toRow(assignment)} timeZone={timeZone} />
        ))}
      </div>
    );
  }

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

      {mainContent}

      {removed.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">No longer in Canvas</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Canvas stopped listing these (deleted, unpublished, or the due date was removed). They&apos;re
            kept here but left out of your plan. Delete them if you don&apos;t need them.
          </p>
          <div className="space-y-3">
            {removed.map((assignment) => (
              <AssignmentRow key={assignment.id} classes={classes} data={toRow(assignment)} timeZone={timeZone} />
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
            {completed.map((assignment) => (
              <AssignmentRow key={assignment.id} classes={classes} data={toRow(assignment)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
