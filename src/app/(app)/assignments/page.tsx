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
import { WorkGroupHeading, WorkHeader } from "./work-header";
import { PathEmpty } from "@/components/brand/path-empty";
import { buttonVariants } from "@/components/ui/button";
import { dueStatus, formatDuration } from "@/lib/format";

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
  importOrigin: "SYLLABUS" | null;
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
    fromSyllabus: assignment.importOrigin === "SYLLABUS",
    pulse,
  };
}

/** "5 open · 1 overdue · 2 due within two days · 6h 15m of work", only the parts that apply. */
function openSummary(open: AssignmentRecord[], timeZone: string): string {
  const now = new Date();
  const overdue = open.filter((a) => dueStatus(a.dueAt, timeZone, now) === "overdue").length;
  const soon = open.filter((a) => ["today", "soon"].includes(dueStatus(a.dueAt, timeZone, now))).length;
  const minutes = open.reduce((total, a) => total + a.estimatedMinutes, 0);
  const parts = [`${open.length} open`];
  if (overdue) parts.push(`${overdue} overdue`);
  if (soon) parts.push(`${soon} due within two days`);
  parts.push(`${formatDuration(minutes)} of work`);
  return parts.join(" · ");
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border-strong px-5 sm:px-8">{children}</div>;
}

function NoClassesYet() {
  return (
    <EmptyCard>
      <PathEmpty title="Add a course first.">
        Assignments belong to a course, so Rushd knows what each one is for.
        <div className="mt-4">
          <Link href="/courses" className={buttonVariants()}>
            Go to Courses
          </Link>
        </div>
      </PathEmpty>
    </EmptyCard>
  );
}

function NoAssignmentsYet({ classes }: { classes: { id: string; name: string; color: string }[] }) {
  return (
    <EmptyCard>
      <PathEmpty title="Your workload starts here.">
        Connect Canvas to import every assignment and due date automatically{aiEnabled ? ", or upload a screenshot of your calendar" : ", or add one by hand"}.
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/integrations/canvas" className={buttonVariants()}>
            Connect Canvas
          </Link>
          {aiEnabled ? (
            <Link href="/import" className={buttonVariants({ variant: "outline" })}>
              Upload screenshot
            </Link>
          ) : (
            <AddAssignmentButton classes={classes} variant="outline" label="Add one by hand" />
          )}
        </div>
      </PathEmpty>
    </EmptyCard>
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
        importOrigin: true,
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
    mainContent = <NoAssignmentsYet classes={classes} />;
  } else {
    mainContent = (
      <div className="space-y-2">
        {active.map((assignment) => (
          <AssignmentRow key={assignment.id} classes={classes} data={toRow(assignment)} timeZone={timeZone} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WorkHeader
        current="assignments"
        title="Assignments"
        description="Ranked by Pulse: how strongly each one needs you right now. Open one for its instructions, rubric, and draft feedback."
        action={<AddAssignmentButton classes={classes} />}
        summary={active.length > 0 ? openSummary(active, timeZone) : undefined}
        showImport={aiEnabled}
      />

      {mainContent}

      {removed.length > 0 && (
        <div>
          <WorkGroupHeading
            note={
              <>
                Canvas stopped listing these (deleted, unpublished, or the due date was removed). They&apos;re
                kept here but left out of your plan. Delete them if you don&apos;t need them.
              </>
            }
          >
            No longer in Canvas
          </WorkGroupHeading>
          <div className="space-y-2">
            {removed.map((assignment) => (
              <AssignmentRow key={assignment.id} classes={classes} data={toRow(assignment)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <WorkGroupHeading>Completed</WorkGroupHeading>
          <div className="space-y-2">
            {completed.map((assignment) => (
              <AssignmentRow key={assignment.id} classes={classes} data={toRow(assignment)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
