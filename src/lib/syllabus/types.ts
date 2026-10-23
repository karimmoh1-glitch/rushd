import * as z from "zod";

// The syllabus import draft: what Rushd found in a student's own syllabus,
// shown for review before anything is saved. Shared by the rules-based parser
// (parse.ts), the AI path (normalize-ai.ts), the review screen, and the
// confirm action. Every item says how sure Rushd is and where in the text it
// came from; anything ambiguous carries an issue and is never silently resolved.

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const ASSESSMENT_TYPES = ["assignment", "quiz", "lab", "project", "paper", "presentation", "midterm", "final", "exam"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  lab: "Lab",
  project: "Project",
  paper: "Paper",
  presentation: "Presentation",
  midterm: "Midterm",
  final: "Final",
  exam: "Exam",
};

/** Saved as an Exam (prep time); everything else is saved as an Assignment. */
export function isExamType(type: AssessmentType): boolean {
  return type === "quiz" || type === "midterm" || type === "final" || type === "exam";
}

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeOfDay = z.string().regex(/^\d{2}:\d{2}$/);

export const SourceRefSchema = z.object({
  /** 1-based line in the extracted text; null when it couldn't be located. */
  line: z.number().int().min(1).nullable(),
  snippet: z.string().max(400),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const DraftAssessmentSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(160),
  type: z.enum(ASSESSMENT_TYPES),
  /** YYYY-MM-DD in the student's calendar, or null when the syllabus doesn't give one. */
  date: DateKey.nullable(),
  time: TimeOfDay.nullable(),
  /** The date as written ("Oct 14", "Week 3", "TBA"). */
  dateText: z.string().max(80).nullable(),
  dateConfidence: z.enum(CONFIDENCES),
  /** Percent of the grade, only when the syllabus states it. */
  weight: z.number().min(0).max(100).nullable(),
  week: z.number().int().min(1).max(60).nullable(),
  confidence: z.enum(CONFIDENCES),
  /** Why this needs a look: no year, TBA, conflicting dates, week without a day... */
  issues: z.array(z.string().max(200)).max(6),
  source: SourceRefSchema,
});
export type DraftAssessment = z.infer<typeof DraftAssessmentSchema>;

export const DraftTopicSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(120),
  parentTitle: z.string().max(120).nullable(),
  week: z.number().int().min(1).max(60).nullable(),
  startDate: DateKey.nullable(),
  endDate: DateKey.nullable(),
  /** Readings listed with the topic, as written. */
  readings: z.string().max(300).nullable(),
  confidence: z.enum(CONFIDENCES),
  issues: z.array(z.string().max(200)).max(6),
  source: SourceRefSchema,
});
export type DraftTopic = z.infer<typeof DraftTopicSchema>;

export const DraftObjectiveSchema = z.object({
  id: z.string().max(40),
  text: z.string().max(300),
  confidence: z.enum(CONFIDENCES),
  source: SourceRefSchema,
});
export type DraftObjective = z.infer<typeof DraftObjectiveSchema>;

export const DraftFieldSchema = z.object({
  value: z.string().max(200),
  confidence: z.enum(CONFIDENCES),
  issues: z.array(z.string().max(200)).max(4),
  source: SourceRefSchema,
});
export type DraftField = z.infer<typeof DraftFieldSchema>;

export const COURSE_FIELDS = ["title", "code", "instructor", "term", "termStart", "termEnd"] as const;
export type CourseField = (typeof COURSE_FIELDS)[number];

export const DraftCourseSchema = z.object({
  title: DraftFieldSchema.nullable(),
  code: DraftFieldSchema.nullable(),
  instructor: DraftFieldSchema.nullable(),
  term: DraftFieldSchema.nullable(),
  /** YYYY-MM-DD values. */
  termStart: DraftFieldSchema.nullable(),
  termEnd: DraftFieldSchema.nullable(),
});
export type DraftCourse = z.infer<typeof DraftCourseSchema>;

export const GradingEntrySchema = z.object({
  label: z.string().max(120),
  weight: z.number().min(0).max(100),
  source: SourceRefSchema,
});
export type GradingEntry = z.infer<typeof GradingEntrySchema>;

export const SyllabusDraftSchema = z.object({
  method: z.enum(["rules", "ai"]),
  course: DraftCourseSchema,
  assessments: z.array(DraftAssessmentSchema).max(150),
  topics: z.array(DraftTopicSchema).max(150),
  objectives: z.array(DraftObjectiveSchema).max(60),
  grading: z.array(GradingEntrySchema).max(30),
  /** Whole-document notes, e.g. "Weeks couldn't be placed on dates: no term start." */
  notes: z.array(z.string().max(300)).max(10),
});
export type SyllabusDraft = z.infer<typeof SyllabusDraftSchema>;

/** Where a week number comes from when it has to become a date. */
export interface TermContext {
  /** YYYY-MM-DD */
  termStart: string | null;
  termEnd: string | null;
  /** Where termStart came from: the student's course settings, or the syllabus itself. */
  termSource: "course" | "syllabus" | null;
}

/** Things the review screen and the confirm action both need to agree on. */
export function isUncertain(item: { confidence: Confidence; issues: string[] } & ({ date: string | null } | object)): boolean {
  if (item.confidence === "low") return true;
  if (item.issues.length > 0) return true;
  if ("date" in item && item.date === null) return true;
  return false;
}

/** Saved outline (CourseMaterial.outline) for a confirmed syllabus. */
export const SyllabusOutlineSchema = z.object({
  objectives: z.array(z.string().max(300)).max(60),
  grading: z.array(z.object({ label: z.string().max(120), weight: z.number().min(0).max(100) })).max(30),
});
export type SyllabusOutline = z.infer<typeof SyllabusOutlineSchema>;
