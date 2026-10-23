import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { resolveTimeZone } from "@/lib/time/zone";
import { SyllabusImport } from "@/components/syllabus/syllabus-import";
import { CourseHeader, getCourseHeader } from "../course-header";

export const metadata: Metadata = { title: "Import syllabus" };
// Reading a long PDF (and, with AI on, the extraction call) can take a while.
export const maxDuration = 60;

export default async function SyllabusImportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const course = await getCourseHeader(user.id, id);
  if (!course) notFound();
  return (
    <div className="space-y-8">
      <CourseHeader course={course} timeZone={resolveTimeZone(user.profile?.timezone)} now={new Date()} />
      <div style={{ ["--course" as string]: course.color }}>
        <SyllabusImport classId={course.id} />
      </div>
    </div>
  );
}
