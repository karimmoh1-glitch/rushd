import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ExamRow } from "./exam-row";
import { AddExamButton } from "./add-exam-button";

export const metadata: Metadata = {
  title: "Exams",
};

export default async function ExamsPage() {
  const user = await requireUser();

  const [classes, exams] = await Promise.all([
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
  ]);

  // Server Component rendered fresh per request — reading the current time
  // here is correct, not a client re-render purity violation.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = exams.filter((e) => e.examAt.getTime() >= now);
  const past = exams.filter((e) => e.examAt.getTime() < now);

  const toRowData = (e: (typeof exams)[number]) => ({
    id: e.id,
    classId: e.classId,
    title: e.title,
    examAt: e.examAt.toISOString(),
    prepMinutes: e.prepMinutes,
    priority: e.priority,
    notes: e.notes ?? undefined,
    className: e.class.name,
    classColor: e.class.color,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Exams</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritized more heavily as the date gets closer.
          </p>
        </div>
        <AddExamButton classes={classes} />
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
      ) : exams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">No exams yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map((e) => (
            <ExamRow key={e.id} classes={classes} data={toRowData(e)} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Past</h2>
          <div className="space-y-3">
            {past.map((e) => (
              <ExamRow key={e.id} classes={classes} data={toRowData(e)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
