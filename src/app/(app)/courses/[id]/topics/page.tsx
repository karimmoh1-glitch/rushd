import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { tutorAvailable } from "@/lib/tutor/availability";
import { getCourseLearning } from "@/lib/learning/load";
import { resolveTimeZone } from "@/lib/time/zone";
import { CourseHeader, getCourseHeader } from "../course-header";
import { TopicsEditor, type TopicRow } from "./topics-editor";

export const metadata: Metadata = { title: "Topics" };

const SOURCE_LABEL = {
  STUDENT: "Added by you",
  SYLLABUS: "From your syllabus",
  TEMPLATE: "From a generic course template",
  AI_SUGGESTED: "Suggested by AI",
} as const;

export default async function TopicsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const now = new Date();
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const course = await getCourseHeader(user.id, id);
  if (!course) notFound();
  const [learning, tutorEnabled] = await Promise.all([getCourseLearning(user.id, course.id, now), tutorAvailable()]);
  if (!learning) notFound();

  const titleById = new Map([...learning.topics, ...learning.proposed].map((t) => [t.id, t.title]));
  const toRow = (t: (typeof learning.topics)[number]): TopicRow => ({
    id: t.id,
    title: t.title,
    parentId: t.parentId,
    status: t.estimate.status,
    explanation: t.estimate.explanation,
    improve: t.estimate.improve[0] ?? null,
    estimate: t.estimate.estimate,
    low: t.estimate.low,
    high: t.estimate.high,
    confidence: t.estimate.confidence,
    answers: t.estimate.answers,
    due: t.estimate.due,
    sourceLabel: SOURCE_LABEL[t.source],
    prerequisiteIds: t.prerequisiteIds,
    prerequisiteTitles: t.prerequisiteIds.map((p) => titleById.get(p) ?? "").filter(Boolean),
    remediation: t.remediation
      ? t.remediation.kind === "prerequisite"
        ? { reason: t.remediation.reason, topicId: t.remediation.topicId, title: t.remediation.title }
        : { reason: t.remediation.reason, topicId: null, title: null }
      : null,
  });

  return (
    <div className="space-y-8">
      <CourseHeader course={course} timeZone={timeZone} now={now} />
      <div style={{ ["--course" as string]: course.color }}>
        <TopicsEditor courseId={course.id} topics={learning.topics.map(toRow)} proposed={learning.proposed.map(toRow)} tutorEnabled={tutorEnabled} />
      </div>
    </div>
  );
}
