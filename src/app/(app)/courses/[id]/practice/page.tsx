import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { getCourseLearning } from "@/lib/learning/load";
import { subjectProfile } from "@/lib/learning/subjects";
import { resolveTimeZone } from "@/lib/time/zone";
import { PathEmpty } from "@/components/brand/path-empty";
import { MasteryChip } from "@/components/learning/mastery-chip";
import { StartPracticeButton } from "@/components/learning/start-practice-button";
import { CourseHeader, getCourseHeader } from "../course-header";
import { AddQuestionButton, GenerateQuestionsButton, QuestionActions } from "./question-tools";

export const metadata: Metadata = { title: "Practice" };
export const maxDuration = 60;

const DIFFICULTY = { 1: "Easier", 2: "Standard", 3: "Harder" } as Record<number, string>;

export default async function CoursePracticePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const now = new Date();
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const course = await getCourseHeader(user.id, id);
  if (!course) notFound();
  const [learning, questions] = await Promise.all([
    getCourseLearning(user.id, course.id, now),
    db.practiceQuestion.findMany({
      where: { userId: user.id, classId: course.id, hiddenAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, topicId: true, origin: true, prompt: true, difficulty: true, sourceNote: true },
    }),
  ]);
  if (!learning) notFound();
  const profile = subjectProfile(course);
  const topicOptions = learning.topics.map((t) => ({ id: t.id, title: t.title }));

  const groups = [
    ...learning.topics.map((t) => ({ topic: t, questions: questions.filter((q) => q.topicId === t.id) })),
    { topic: null, questions: questions.filter((q) => !q.topicId || !learning.topics.some((t) => t.id === q.topicId)) },
  ].filter((g) => g.topic !== null || g.questions.length > 0);

  return (
    <div className="space-y-8">
      <CourseHeader course={course} timeZone={timeZone} now={now} />
      <div style={{ ["--course" as string]: course.color }} className="space-y-8">
        <section aria-labelledby="practice-start" className="rounded-xl bg-card px-4 py-4 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-5">
          <h2 id="practice-start" className="text-[15px] font-semibold">
            Practice {course.name}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{profile.practiceNote}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Try each question before you look: hints come first, then the answer. You mark your own result, and every answer
            becomes evidence for the topic.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {questions.length > 0 && <StartPracticeButton classId={course.id} label="Start a practice session" variant="signal" />}
            <AddQuestionButton courseId={course.id} topics={topicOptions} profile={profile} />
          </div>
        </section>

        {learning.review.length > 0 && (
          <section aria-labelledby="review-due">
            <h2 id="review-due" className="border-b border-border pb-2 text-base font-semibold">
              Due for review
            </h2>
            <ul className="divide-y divide-border">
              {learning.review.map((item) => (
                <li key={item.topicId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {item.title} <MasteryChip status={item.status} />
                    </span>
                    <span className="block text-xs text-muted-foreground">{item.reason}</span>
                  </span>
                  <StartPracticeButton classId={course.id} topicId={item.topicId} mode="review" label="Review" size="sm" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="question-bank" className="space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
            <h2 id="question-bank" className="text-base font-semibold">
              Questions
            </h2>
            {!aiEnabled && (
              <span className="text-xs text-muted-foreground">Generated questions aren&apos;t available yet. Add your own.</span>
            )}
          </div>
          {learning.topics.length === 0 && questions.length === 0 ? (
            <PathEmpty title="Nothing to practice yet">
              <p>
                Add a question you want to be able to answer, with its answer. For mastery by topic,{" "}
                <Link href={`/courses/${course.id}/topics`} className="underline underline-offset-4">
                  add this course&apos;s topics
                </Link>{" "}
                first.
              </p>
            </PathEmpty>
          ) : (
            groups.map(({ topic, questions: list }) => (
              <div key={topic?.id ?? "none"} className={topic?.parentId ? "ml-4 border-l border-border pl-4 sm:ml-6" : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    {topic ? topic.title : "Not tied to a topic"}
                    {topic && <MasteryChip status={topic.estimate.status} />}
                  </h3>
                  <span className="flex flex-wrap gap-1.5">
                    {topic && list.length > 0 && <StartPracticeButton classId={course.id} topicId={topic.id} label="Practice" size="sm" variant="ghost" />}
                    {topic && aiEnabled && <GenerateQuestionsButton courseId={course.id} topicId={topic.id} />}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No questions for this topic yet.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-border">
                    {list.map((q) => (
                      <li key={q.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm whitespace-pre-line">{q.prompt}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {q.origin === "AI_GENERATED" ? (
                              <span className="font-medium text-signal-ink">AI-generated · unverified</span>
                            ) : (
                              <span>Your question</span>
                            )}
                            {" · "}
                            {DIFFICULTY[q.difficulty] ?? "Standard"}
                          </p>
                        </div>
                        <QuestionActions courseId={course.id} questionId={q.id} generated={q.origin === "AI_GENERATED"} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
          {(aiEnabled || questions.some((q) => q.origin === "AI_GENERATED")) && (
          <p className="text-xs text-muted-foreground">
            Generated questions are practice material written by AI from your topics and course materials. They aren&apos;t
            official exam questions and may contain mistakes; report any that look wrong.
          </p>
          )}
        </section>
      </div>
    </div>
  );
}
