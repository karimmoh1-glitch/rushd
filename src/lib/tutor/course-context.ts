import "server-only";
import { db } from "@/lib/db";
import { getCourseLearning } from "@/lib/learning/load";
import { getMistakes } from "@/lib/learning/practice";
import { searchMaterials, type MaterialHit } from "@/lib/course/retrieval";
import { calendarDaysBetween } from "@/lib/time/zone";
import { LEVEL_LABEL, type ContextMistake, type ContextTopic, type CourseContextInput, type CourseLevelValue } from "./context";

// Fills CourseContextInput from the database. Every query is scoped to the
// userId from the session; ids that aren't the student's simply aren't found.

const EXAM_LOOKAHEAD_DAYS = 60;
const ASSIGNMENT_LOOKAHEAD_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LoadedCourseContext {
  input: CourseContextInput;
  /** Materials retrieved for the question, to register for citations. */
  materials: MaterialHit[];
}

/** Whether a syllabus is on file: confirmed topics imported from one, or a synced material titled "syllabus". */
async function syllabusFor(userId: string, classId: string): Promise<{ uploaded: boolean; via: string | null }> {
  const [imported, material] = await Promise.all([
    db.courseTopic.count({ where: { userId, classId, source: "SYLLABUS", status: "CONFIRMED" } }),
    db.courseMaterial.findFirst({ where: { userId, classId, title: { contains: "syllabus", mode: "insensitive" } }, select: { title: true } }),
  ]);
  if (imported > 0) return { uploaded: true, via: `${imported} topics imported from the student's syllabus and confirmed` };
  if (material) return { uploaded: true, via: `a synced course page titled "${material.title}" (search it for details)` };
  return { uploaded: false, via: null };
}

export async function loadCourseContext(
  userId: string,
  options: {
    classId: string | null;
    focusTopicId?: string | null;
    focusQuestionId?: string | null;
    question: string;
    now: Date;
    timeZone: string;
  },
): Promise<LoadedCourseContext> {
  const { now, timeZone } = options;
  const empty: CourseContextInput = {
    course: null,
    otherCourses: [],
    topics: [],
    proposedTopicCount: 0,
    mistakes: [],
    assessments: [],
    materials: [],
    materialCount: 0,
    syllabus: { uploaded: false, via: null },
    focus: { topic: null, mistake: null },
    now,
    timeZone,
  };

  const course = options.classId
    ? await db.class.findFirst({
        where: { id: options.classId, userId },
        select: { id: true, name: true, level: true, code: true, institution: true, subject: true, teacher: true },
      })
    : null;

  if (!course) {
    const [classes, materials] = await Promise.all([
      db.class.findMany({ where: { userId, archived: false }, orderBy: { createdAt: "asc" }, take: 12, select: { name: true } }),
      searchMaterials(userId, { query: options.question, limit: 3 }),
    ]);
    return {
      input: { ...empty, otherCourses: classes.map((c) => c.name), materials: materials.map((m) => ({ id: m.id, title: m.title, kind: m.kind, excerpt: m.excerpt })) },
      materials,
    };
  }

  const [learning, mistakes, exams, assignments, materials, materialCount, syllabus] = await Promise.all([
    getCourseLearning(userId, course.id, now),
    getMistakes(userId, course.id),
    db.exam.findMany({
      where: { userId, classId: course.id, examAt: { gte: now, lte: new Date(now.getTime() + EXAM_LOOKAHEAD_DAYS * DAY_MS) } },
      orderBy: { examAt: "asc" },
      take: 5,
      select: { id: true, title: true, examAt: true },
    }),
    db.assignment.findMany({
      where: { userId, classId: course.id, status: { not: "COMPLETED" }, dueAt: { gte: now, lte: new Date(now.getTime() + ASSIGNMENT_LOOKAHEAD_DAYS * DAY_MS) } },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: { id: true, title: true, dueAt: true },
    }),
    searchMaterials(userId, { query: options.question, classId: course.id, limit: 4 }),
    db.courseMaterial.count({ where: { userId, classId: course.id } }),
    syllabusFor(userId, course.id),
  ]);

  const titleById = new Map((learning?.topics ?? []).map((t) => [t.id, t.title]));
  const topics: ContextTopic[] = (learning?.topics ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    parentTitle: t.parentId ? (titleById.get(t.parentId) ?? null) : null,
    source: t.source,
    status: t.estimate.status,
    estimate: t.estimate.estimate,
    confidence: t.estimate.confidence,
    answers: t.estimate.answers,
    due: t.estimate.due,
    remediation: t.remediation
      ? { prerequisiteTitle: t.remediation.kind === "prerequisite" ? t.remediation.title : null, reason: t.remediation.reason }
      : null,
  }));

  const visible = (mistakes ?? []).filter((m) => !m.hidden);
  const toContext = (m: (typeof visible)[number]): ContextMistake => ({
    questionId: m.questionId,
    topicTitle: m.topicTitle,
    prompt: m.prompt,
    correctAnswer: m.answer,
    studentAnswer: m.studentAnswer,
    timesMissed: m.timesMissed,
    lastMissedAt: m.lastMissedAt,
    resolved: m.resolved,
    aiGenerated: m.origin === "AI_GENERATED",
  });
  // Open mistakes first, most recent first.
  const ordered = [...visible.filter((m) => !m.resolved), ...visible.filter((m) => m.resolved)];
  const focusMistake = options.focusQuestionId ? visible.find((m) => m.questionId === options.focusQuestionId) : undefined;
  const focusTopic = options.focusTopicId ? topics.find((t) => t.id === options.focusTopicId) : undefined;

  const assessments = [
    ...exams.map((e) => ({ id: e.id, kind: "exam" as const, title: e.title, at: e.examAt, daysLeft: calendarDaysBetween(e.examAt, now, timeZone) })),
    ...assignments.map((a) => ({ id: a.id, kind: "assignment" as const, title: a.title, at: a.dueAt, daysLeft: calendarDaysBetween(a.dueAt, now, timeZone) })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    input: {
      ...empty,
      course: {
        id: course.id,
        name: course.name,
        level: (course.level as CourseLevelValue | null) ?? null,
        code: course.code,
        institution: course.institution,
        subject: course.subject,
        teacher: course.teacher,
      },
      topics,
      proposedTopicCount: learning?.proposed.length ?? 0,
      mistakes: ordered.slice(0, 8).map(toContext),
      assessments,
      materials: materials.map((m) => ({ id: m.id, title: m.title, kind: m.kind, excerpt: m.excerpt })),
      materialCount,
      syllabus,
      focus: { topic: focusTopic ?? null, mistake: focusMistake ? toContext(focusMistake) : null },
    },
    materials,
  };
}

export interface CourseContextSummary {
  classId: string;
  levelLabel: string | null;
  topicCount: number;
  syllabusUploaded: boolean;
  materialCount: number;
}

/** Per-course counts for the context chips on the tutor page. */
export async function loadContextSummaries(userId: string): Promise<CourseContextSummary[]> {
  const [classes, topics, syllabusTopics, materials, syllabusMaterials] = await Promise.all([
    db.class.findMany({ where: { userId, archived: false }, select: { id: true, level: true } }),
    db.courseTopic.groupBy({ by: ["classId"], where: { userId, status: "CONFIRMED" }, _count: { _all: true } }),
    db.courseTopic.groupBy({ by: ["classId"], where: { userId, status: "CONFIRMED", source: "SYLLABUS" }, _count: { _all: true } }),
    db.courseMaterial.groupBy({ by: ["classId"], where: { userId }, _count: { _all: true } }),
    db.courseMaterial.groupBy({ by: ["classId"], where: { userId, title: { contains: "syllabus", mode: "insensitive" } }, _count: { _all: true } }),
  ]);
  const count = (rows: { classId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.classId === id)?._count._all ?? 0;
  return classes.map((c) => ({
    classId: c.id,
    levelLabel: c.level ? LEVEL_LABEL[c.level as CourseLevelValue] : null,
    topicCount: count(topics, c.id),
    syllabusUploaded: count(syllabusTopics, c.id) + count(syllabusMaterials, c.id) > 0,
    materialCount: count(materials, c.id),
  }));
}
