import { catalogRecord, type CatalogKind, type CatalogRecord, type CourseLevelValue, type Subject } from "@/lib/courses/catalog";
import { displayLevel, normalize } from "@/lib/courses/catalog/search";
import { CLASS_COLORS } from "@/lib/class-colors";
import type { ClassInput } from "@/lib/validation/classes";

// A course chosen in the picker, before it's saved: either a catalog record or
// a custom course named by the student.

export interface PickedCourse {
  /** Unique within one picker: the catalog id, or "custom:<name>". */
  key: string;
  catalogId: string | null;
  title: string;
  subject: Subject | null;
  level: CourseLevelValue | null;
  kind: CatalogKind | "custom";
}

export function pickRecord(record: CatalogRecord, studentLevel: CourseLevelValue | null): PickedCourse {
  return {
    key: record.id,
    catalogId: record.id,
    title: record.title,
    subject: record.subject,
    level: displayLevel(record, studentLevel),
    kind: record.kind,
  };
}

export function pickCustom(title: string, studentLevel: CourseLevelValue | null): PickedCourse {
  const name = title.trim().replace(/\s+/g, " ").slice(0, 80);
  return { key: `custom:${normalize(name)}`, catalogId: null, title: name, subject: null, level: studentLevel, kind: "custom" };
}

/** Restores a picked course from a stored catalog id (null if the record is gone). */
export function pickById(catalogId: string, studentLevel: CourseLevelValue | null): PickedCourse | null {
  const record = catalogRecord(catalogId);
  return record ? pickRecord(record, studentLevel) : null;
}

/** The palette color for the n-th course a student has. */
export function colorFor(index: number): string {
  return CLASS_COLORS[index % CLASS_COLORS.length].value;
}

export interface CourseDetails {
  institution?: string;
  code?: string;
  termStart?: string;
  termEnd?: string;
  weeklyHours?: number;
}

/** What gets saved for a picked course: the name, color, level, subject, catalog id, and any details. */
export function toClassInput(course: PickedCourse, color: string, details: CourseDetails = {}): ClassInput {
  return {
    name: course.title,
    color,
    priority: "MEDIUM",
    level: course.level ?? undefined,
    subject: course.subject ?? undefined,
    catalogId: course.catalogId ?? undefined,
    institution: details.institution,
    code: details.code,
    termStart: details.termStart,
    termEnd: details.termEnd,
    weeklyHours: details.weeklyHours,
  };
}

/** How a course's content is known, in the student's words. */
export function provenanceLabel(course: Pick<PickedCourse, "kind">, provider?: string): string {
  if (course.kind === "official") return provider === "College Board" ? "Official College Board course" : provider === "International Baccalaureate" ? "Official IB subject" : "Official course";
  if (course.kind === "template") return "Generic template";
  return "Your own course";
}
