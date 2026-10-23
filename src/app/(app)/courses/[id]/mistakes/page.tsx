import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getMistakes } from "@/lib/learning/practice";
import { formatDateInZone, resolveTimeZone } from "@/lib/time/zone";
import { PathEmpty } from "@/components/brand/path-empty";
import { StartPracticeButton } from "@/components/learning/start-practice-button";
import { CourseHeader, getCourseHeader } from "../course-header";

export const metadata: Metadata = { title: "Mistakes" };

export default async function MistakesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const now = new Date();
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const course = await getCourseHeader(user.id, id);
  if (!course) notFound();
  const mistakes = (await getMistakes(user.id, course.id)) ?? [];
  const open = mistakes.filter((m) => !m.resolved && !m.hidden);
  const resolved = mistakes.filter((m) => m.resolved && !m.hidden);

  return (
    <div className="space-y-8">
      <CourseHeader course={course} timeZone={timeZone} now={now} />
      <div style={{ ["--course" as string]: course.color }} className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Mistake history</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Questions you missed or only partly got, with what you wrote. Retrying them in a later session is one of the
              best uses of study time.
            </p>
          </div>
          {open.length > 0 && <StartPracticeButton classId={course.id} mode="mistakes" questionIds={open.map((m) => m.questionId).slice(0, 8)} label="Retry missed questions" variant="signal" />}
        </div>

        {mistakes.length === 0 ? (
          <PathEmpty title="No mistakes recorded">
            <p>
              When you mark an answer as missed or partly right in{" "}
              <Link href={`/courses/${course.id}/practice`} className="underline underline-offset-4">
                practice
              </Link>
              , it shows up here so you can come back to it.
            </p>
          </PathEmpty>
        ) : (
          [
            { key: "open", title: "To retry", list: open },
            { key: "resolved", title: "Answered correctly since", list: resolved },
          ]
            .filter((group) => group.list.length > 0)
            .map((group) => (
              <section key={group.key} aria-labelledby={`mistakes-${group.key}`}>
                <h3 id={`mistakes-${group.key}`} className="border-b border-border pb-2 text-sm font-semibold">
                  {group.title} <span className="font-normal text-muted-foreground">· {group.list.length}</span>
                </h3>
                <ul className="divide-y divide-border">
                  {group.list.map((m) => (
                    <li key={m.questionId} className="py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium whitespace-pre-line">{m.prompt}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {m.topicTitle ? `${m.topicTitle} · ` : ""}
                            {m.lastResult === "PARTIAL" ? "Partly right" : "Missed"} {formatDateInZone(m.lastMissedAt, timeZone, { month: "short", day: "numeric" })}
                            {m.timesMissed > 1 ? ` · missed ${m.timesMissed} times` : ""}
                            {m.origin === "AI_GENERATED" ? " · AI-generated, unverified" : ""}
                          </p>
                        </div>
                        {!m.resolved && <StartPracticeButton classId={course.id} mode="mistakes" questionIds={[m.questionId]} label="Retry" size="sm" />}
                      </div>
                      {m.studentAnswer && (
                        <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">
                          <span className="text-xs font-medium text-muted-foreground">You wrote: </span>
                          {m.studentAnswer}
                        </p>
                      )}
                      <details className="group mt-2 text-sm">
                        <summary className="inline-flex min-h-9 cursor-pointer items-center text-muted-foreground hover:text-foreground">
                          Show the answer
                        </summary>
                        <div className="mt-1 rounded-lg border border-border px-3 py-2">
                          <p className="whitespace-pre-line">{m.answer}</p>
                          {m.explanation && <p className="mt-2 whitespace-pre-line text-muted-foreground">{m.explanation}</p>}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))
        )}
      </div>
    </div>
  );
}
