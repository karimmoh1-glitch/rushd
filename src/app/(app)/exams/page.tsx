import { aiEnabled } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { pulseOf } from "@/lib/planning/pulse";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { resolveTimeZone } from "@/lib/time/zone";
import { ExamRow, type ExamRowData } from "./exam-row";
import { AddExamButton } from "./add-exam-button";

export const metadata: Metadata = {
  title: "Exams",
};

interface ExamRecord {
  id: string;
  classId: string;
  title: string;
  examAt: Date;
  prepMinutes: number;
  priority: ExamRowData["priority"];
  notes: string | null;
  class: { name: string; color: string };
}

/** The plain, serializable shape the client-side row needs. */
function toRowData(exam: ExamRecord, pulse: number | null): ExamRowData {
  return {
    id: exam.id,
    classId: exam.classId,
    title: exam.title,
    examAt: exam.examAt.toISOString(),
    pulse,
    prepMinutes: exam.prepMinutes,
    priority: exam.priority,
    notes: exam.notes ?? undefined,
    className: exam.class.name,
    classColor: exam.class.color,
  };
}

function NoClassesYet() {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-muted-foreground">Add a class first.</p>
      <Link
        href="/courses"
        className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        Go to Classes
      </Link>
    </div>
  );
}

export default async function ExamsPage() {
  const user = await requireUser();
  const timeZone = resolveTimeZone(user.profile?.timezone);

  const [classes, exams, plan] = await Promise.all([
    db.class.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.exam.findMany({
      where: { userId: user.id },
      orderBy: { examAt: "asc" },
      select: {
        id: true,
        classId: true,
        title: true,
        examAt: true,
        prepMinutes: true,
        priority: true,
        notes: true,
        class: { select: { name: true, color: true } },
      },
    }),
    generatePlanForUser(user.id),
  ]);
  const pulseById = new Map(plan.scored.map((scored) => [scored.item.id, pulseOf(scored.score)]));
  function toRow(exam: ExamRecord): ExamRowData {
    return toRowData(exam, pulseById.get(exam.id) ?? null);
  }

  // This page renders fresh on every request, so reading the clock here is fine.
  const now = new Date();
  const upcoming = exams.filter((exam) => exam.examAt.getTime() >= now.getTime());
  const past = exams.filter((exam) => exam.examAt.getTime() < now.getTime());

  let mainContent: React.ReactNode;
  if (classes.length === 0) {
    mainContent = <NoClassesYet />;
  } else if (exams.length === 0) {
    mainContent = (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-muted-foreground">No exams yet.</p>
      </div>
    );
  } else {
    mainContent = (
      <div className="space-y-3">
        {upcoming.map((exam) => (
          <ExamRow key={exam.id} classes={classes} data={toRow(exam)} timeZone={timeZone} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Exams</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritized more heavily as the date gets closer.
          </p>
          <nav aria-label="Work" className="mt-3 flex gap-4 text-sm">
            <Link href="/assignments" className="text-muted-foreground hover:text-foreground">Assignments</Link>
            <span aria-current="page" className="font-medium">Exams</span>
            {aiEnabled && <Link href="/import" className="text-muted-foreground hover:text-foreground">Import from a screenshot</Link>}
          </nav>
        </div>
        <AddExamButton classes={classes} />
      </div>

      {mainContent}

      {past.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Past</h2>
          <div className="space-y-3">
            {past.map((exam) => (
              <ExamRow key={exam.id} classes={classes} data={toRow(exam)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
