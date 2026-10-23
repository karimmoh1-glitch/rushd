import Link from "next/link";
import { MasteryChip } from "@/components/learning/mastery-chip";
import { StartPracticeButton } from "@/components/learning/start-practice-button";
import type { LearningGap } from "@/lib/planning/outcomes";
import type { MasterySummary } from "@/lib/planning/types";
import { Panel } from "./panel";

export interface CourseMasteryRow {
  id: string;
  name: string;
  color: string;
  mastery: MasterySummary;
}

const SEGMENTS: { key: keyof Omit<MasterySummary, "total">; className: string; label: (n: number) => string }[] = [
  { key: "needsReview", className: "bg-signal", label: (n) => `${n} need${n === 1 ? "s" : ""} review` },
  { key: "developing", className: "bg-foreground/45", label: (n) => `${n} developing` },
  { key: "secure", className: "bg-done", label: (n) => `${n} secure` },
  { key: "unknown", className: "bg-muted-foreground/25", label: (n) => `${n} not enough evidence` },
];

function countsLine(m: MasterySummary): string {
  return SEGMENTS.filter((s) => m[s.key] > 0)
    .map((s) => s.label(m[s.key]))
    .join(" · ");
}

/** "What is my biggest learning gap?" plus a compact mastery overview across
 * courses. Everything comes from the student's own answers. */
export function LearningPanel({ gap, courses, hasEvidence }: { gap: LearningGap | null; courses: CourseMasteryRow[]; hasEvidence: boolean }) {
  return (
    <Panel
      id="learning-heading"
      title="Learning"
      aside={
        <Link href="/mastery" className="text-sm text-muted-foreground hover:text-foreground">
          Mastery
        </Link>
      }
    >
      <div className="space-y-4 pb-1 pt-2">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add topics to a course and practice a few questions. Your biggest gap and mastery show up here; nothing is
            guessed.{" "}
            <Link href="/courses" className="font-medium text-foreground underline underline-offset-4">
              Courses
            </Link>
          </p>
        ) : gap ? (
          <div aria-label="Biggest gap" role="group" style={{ ["--course" as string]: gap.classColor }}>
            <p className="text-xs font-medium text-muted-foreground">Biggest gap</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-sm font-medium">
                {gap.title} <span className="font-normal text-muted-foreground">· {gap.className}</span>
              </p>
              <MasteryChip status={gap.estimate.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{gap.reason}</p>
            {gap.remediation && <p className="mt-1.5 text-xs">{gap.remediation.reason}</p>}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <StartPracticeButton classId={gap.classId} topicId={gap.topicId} label="Practice" size="sm" variant="outline" />
              {gap.remediation?.kind === "prerequisite" && (
                <StartPracticeButton
                  classId={gap.classId}
                  topicId={gap.remediation.topicId}
                  label={`Practice ${gap.remediation.title}`}
                  size="sm"
                  variant="ghost"
                />
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {hasEvidence
              ? "No weak spot stands out in your practice so far."
              : "No gap to show yet: practice a few questions and Rushd finds the weakest topic that matters soonest."}
          </p>
        )}

        {courses.length > 0 && (
          <ul className="space-y-3 border-t border-border pt-3" aria-label="Mastery by course">
            {courses.map((course) => (
              <li key={course.id} style={{ ["--course" as string]: course.color }}>
                <Link href={`/courses/${course.id}/topics`} className="group block rounded-md">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="course-rule h-2 w-2 shrink-0 rounded-full" />
                      <span className="truncate group-hover:underline group-hover:underline-offset-4">{course.name}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {course.mastery.total} {course.mastery.total === 1 ? "topic" : "topics"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-muted">
                    {SEGMENTS.map((segment) =>
                      course.mastery[segment.key] > 0 ? (
                        <span
                          key={segment.key}
                          className={`block h-full ${segment.className}`}
                          style={{ width: `${(course.mastery[segment.key] / course.mastery.total) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{countsLine(course.mastery)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
