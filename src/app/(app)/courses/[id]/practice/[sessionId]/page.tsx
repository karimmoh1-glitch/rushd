import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getSession } from "@/lib/learning/practice";
import { subjectProfile } from "@/lib/learning/subjects";
import { SessionRunner } from "./session-runner";

export const metadata: Metadata = { title: "Practice session" };

export default async function PracticeSessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const user = await requireUser();
  const { id, sessionId } = await params;
  const session = await getSession(user.id, sessionId);
  if (!session || session.classId !== id) notFound();
  const course = await db.class.findFirst({ where: { id, userId: user.id }, select: { id: true, name: true, color: true, subject: true } });
  if (!course) notFound();
  const profile = subjectProfile(course);

  return (
    <div className="mx-auto max-w-2xl space-y-6" style={{ ["--course" as string]: course.color }}>
      <header>
        <Link href={`/courses/${course.id}/practice`} className="text-sm text-muted-foreground hover:text-foreground">
          {course.name} · Practice
        </Link>
        <h1 className="mt-1 font-display text-[1.75rem] font-medium leading-tight tracking-tight">
          {session.mode === "mistakes" ? "Retry missed questions" : session.mode === "review" ? "Review session" : "Practice session"}
        </h1>
      </header>
      <SessionRunner
        courseId={course.id}
        sessionId={session.id}
        completed={session.completed}
        questions={session.questions}
        answered={session.answered}
        attemptPlaceholder={profile.attemptPlaceholder}
        code={profile.format === "code"}
      />
    </div>
  );
}
