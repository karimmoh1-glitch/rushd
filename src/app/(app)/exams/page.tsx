import { aiEnabled } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { currentTime } from "@/lib/time/now";
import { pulseOf } from "@/lib/planning/pulse";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { resolveTimeZone } from "@/lib/time/zone";
import { ExamRow, type ExamRowData } from "./exam-row";
import { AddExamButton } from "./add-exam-button";
import { WorkGroupHeading, WorkHeader } from "../assignments/work-header";
import { PathEmpty } from "@/components/brand/path-empty";
import { buttonVariants } from "@/components/ui/button";
import { formatDaysUntil, formatDuration } from "@/lib/format";

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
  weightPercent: number | null;
  importOrigin: "SYLLABUS" | null;
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
    weightPercent: exam.weightPercent,
    className: exam.class.name,
    classColor: exam.class.color,
    fromSyllabus: exam.importOrigin === "SYLLABUS",
  };
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border-strong px-5 sm:px-8">{children}</div>;
}

function NoClassesYet() {
  return (
    <EmptyCard>
      <PathEmpty title="Add a course first.">
        Exams belong to a course, so Rushd knows what to help you prepare for.
        <div className="mt-4">
          <Link href="/courses" className={buttonVariants()}>
            Go to Courses
          </Link>
        </div>
      </PathEmpty>
    </EmptyCard>
  );
}

/** "2 upcoming · next in 4 days · 4h of prep". */
function upcomingSummary(upcoming: ExamRecord[], timeZone: string): string {
  const prep = upcoming.reduce((total, exam) => total + exam.prepMinutes, 0);
  return [`${upcoming.length} upcoming`, `next ${formatDaysUntil(upcoming[0].examAt, timeZone).toLowerCase()}`, `${formatDuration(prep)} of prep`].join(" · ");
}

export default async function ExamsPage() {
  const user = await requireUser();
  const now = await currentTime();
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
        weightPercent: true,
        importOrigin: true,
        class: { select: { name: true, color: true } },
      },
    }),
    generatePlanForUser(user.id, now),
  ]);
  const pulseById = new Map(plan.scored.map((scored) => [scored.item.id, pulseOf(scored.score)]));
  function toRow(exam: ExamRecord): ExamRowData {
    return toRowData(exam, pulseById.get(exam.id) ?? null);
  }

  const upcoming = exams.filter((exam) => exam.examAt.getTime() >= now.getTime());
  const past = exams.filter((exam) => exam.examAt.getTime() < now.getTime());

  let mainContent: React.ReactNode;
  if (classes.length === 0) {
    mainContent = <NoClassesYet />;
  } else if (exams.length === 0) {
    mainContent = (
      <EmptyCard>
        <PathEmpty title="No exams yet.">
          Add a test, quiz, or final and Rushd plans your prep time before it, more of it as the date gets closer.
          <div className="mt-4">
            <AddExamButton classes={classes} variant="outline" label="Add your first exam" />
          </div>
        </PathEmpty>
      </EmptyCard>
    );
  } else {
    mainContent = (
      <div className="space-y-2">
        {upcoming.map((exam) => (
          <ExamRow key={exam.id} classes={classes} data={toRow(exam)} timeZone={timeZone} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WorkHeader
        current="exams"
        title="Exams"
        description="Prioritized more heavily as the date gets closer."
        action={<AddExamButton classes={classes} />}
        summary={upcoming.length > 0 ? upcomingSummary(upcoming, timeZone) : undefined}
        showImport={aiEnabled}
      />

      {mainContent}

      {past.length > 0 && (
        <div>
          <WorkGroupHeading>Past</WorkGroupHeading>
          <div className="space-y-2">
            {past.map((exam) => (
              <ExamRow key={exam.id} classes={classes} data={toRow(exam)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
