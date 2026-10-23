import Link from "next/link";
import { ArrowRight, BookOpenCheck, ListChecks, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// What the student can do without AI: the same learning loop, from their own
// topics, questions and answers. Shown when the tutor is off, and after a
// failed reply, instead of a dead end.

export interface FallbackReview {
  topicTitle: string;
  classId: string;
  className: string;
  reason: string;
  minutes: number;
}

export interface FallbackCourse {
  id: string;
  name: string;
  color: string;
  openMistakes: number | null;
}

export interface FallbackData {
  reviews: FallbackReview[];
  courses: FallbackCourse[];
}

const linkClass =
  "group flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted focus-visible:bg-muted";

export function TutorFallback({
  data,
  classId,
  title,
  reason,
  compact = false,
}: {
  data: FallbackData;
  classId: string | null;
  title: string;
  reason: string;
  compact?: boolean;
}) {
  const courses = classId ? data.courses.filter((c) => c.id === classId) : data.courses;
  const reviews = (classId ? data.reviews.filter((r) => r.classId === classId) : data.reviews).slice(0, compact ? 3 : 6);

  return (
    <section aria-labelledby="tutor-fallback-title" className={cn("rounded-xl bg-card shadow-(--shadow-card) ring-1 ring-foreground/[0.07]", compact ? "p-4" : "p-5 sm:p-6")}>
      <h2 id="tutor-fallback-title" className={cn("font-display tracking-tight", compact ? "text-lg" : "text-xl")}>
        {title}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{reason}</p>

      {courses.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add a course first; practice, mistakes and review all live inside a course.{" "}
          <Link href="/courses" className="text-foreground underline underline-offset-4">
            Go to courses
          </Link>
        </p>
      ) : (
        <div className={cn("mt-4 grid gap-5", !compact && "md:grid-cols-2")}>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Topics to review
            </h3>
            {reviews.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing is due for review. Review dates come from your practice answers.
              </p>
            ) : (
              <ul className="mt-1 -mx-3">
                {reviews.map((r) => (
                  <li key={`${r.classId}-${r.topicTitle}`}>
                    <Link href={`/courses/${r.classId}/topics`} className={linkClass}>
                      <span className="min-w-0">
                        <span className="block font-medium">{r.topicTitle}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.className} · about {r.minutes} min · {r.reason}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BookOpenCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Practice with your own questions
              </h3>
              <ul className="mt-1 -mx-3">
                {courses.map((c) => (
                  <li key={c.id} style={{ ["--course" as string]: c.color }}>
                    <Link href={`/courses/${c.id}/practice`} className={linkClass} aria-label={`Practice: ${c.name}`}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--course)]" />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Review your mistakes
              </h3>
              <ul className="mt-1 -mx-3">
                {courses.map((c) => (
                  <li key={c.id}>
                    <Link href={`/courses/${c.id}/mistakes`} className={linkClass} aria-label={`Mistakes: ${c.name}`}>
                      <span className="truncate">{c.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {c.openMistakes === null ? null : c.openMistakes === 0 ? "none to retry" : `${c.openMistakes} to retry`}
                        <ArrowRight className="h-4 w-4 group-hover:text-foreground" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
