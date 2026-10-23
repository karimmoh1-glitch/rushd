import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { aiEnabled } from "@/lib/env";
import { aiProvider, type AIProvider, type CallUsage } from "@/lib/ai";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { logEvent } from "@/lib/analytics/log-event";
import { toDateInput } from "@/lib/courses/service";
import { MAX_TOPICS_PER_COURSE, confirmTopics, proposeTopics } from "@/lib/learning/topics";
import { topicKey } from "@/lib/practice/mastery";
import { localDateKey, resolveTimeZone, zonedTimeToUtc } from "@/lib/time/zone";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import { ConfirmSyllabusSchema, type ConfirmSyllabusInput } from "./confirm-schema";
import { extractDocumentText, type SourceKind } from "./extract-text";
import { normalizeAiDraft } from "./normalize-ai";
import { MAX_SYLLABUS_CHARS, normalizeSyllabusText, parseSyllabus } from "./parse";
import { defaultMinutes, findDuplicate, previewCounts, savedAs, type ExistingWork } from "./review";
import type { SyllabusDraft, SyllabusOutline } from "./types";

// Syllabus import: preview, then confirm. Every function takes the signed-in
// student's userId and scopes every read and write by it.
//
// previewSyllabus() reads the file or pasted text and returns a draft. It
// writes nothing the student owns (only a count-only analytics event and, when
// AI is used, the usage meter row). confirmSyllabusImport() writes exactly
// what the student kept on the review screen, re-checking ownership and
// duplicates, and stores the syllabus text as a course material so the tutor
// and course search can use it.

/** The CourseMaterial.canvasCourseId marker for imported syllabi (a Canvas sync never matches it). */
export const SYLLABUS_MATERIAL_MARKER = "rushd:syllabus";
const MIN_TEXT_CHARS = 40;

export type SyllabusProvider = Pick<AIProvider, "extractSyllabus">;

export interface PreviewInput {
  classId: string;
  /** Pasted text, or the text of an uploaded file. */
  text?: string | null;
  file?: { bytes: Uint8Array; name: string } | null;
  /** A week-1 start the student typed on the review screen (YYYY-MM-DD). */
  termStart?: string | null;
}

export interface SyllabusPreview {
  classId: string;
  className: string;
  draft: SyllabusDraft;
  /** The normalized text the line numbers refer to; sent back on confirm. */
  text: string;
  source: SourceKind | "paste";
  sourceName: string | null;
  pages: number | null;
  truncated: boolean;
  /** What the course has now, to compare with the syllabus. */
  current: { termStart: string | null; termEnd: string | null; code: string | null; teacher: string | null };
  /** Assessment id → the existing item it matches. */
  duplicates: Record<string, { title: string; date: string; kind: "assignment" | "exam" }>;
  /** Topic ids already in the course's topic map. */
  existingTopics: string[];
  /** The week-1 start the student typed, when this preview used one. */
  termStartOverride: string | null;
}

export type PreviewResult = { ok: true; preview: SyllabusPreview } | { ok: false; error: string };

interface PreviewDeps {
  provider?: SyllabusProvider;
  /** Whether to try AI extraction (defaults to whether a key is configured). */
  aiAvailable?: boolean;
  now?: Date;
}

async function ownedCourse(userId: string, classId: string) {
  return db.class.findFirst({
    where: { id: classId, userId },
    select: { id: true, name: true, termStart: true, termEnd: true, code: true, teacher: true, user: { select: { profile: { select: { timezone: true } } } } },
  });
}

async function existingWork(userId: string, classId: string, timeZone: string): Promise<ExistingWork[]> {
  const [assignments, exams] = await Promise.all([
    db.assignment.findMany({ where: { userId, classId }, select: { title: true, dueAt: true } }),
    db.exam.findMany({ where: { userId, classId }, select: { title: true, examAt: true } }),
  ]);
  return [
    ...assignments.map((a) => ({ title: a.title, date: localDateKey(a.dueAt, timeZone), kind: "assignment" as const })),
    ...exams.map((e) => ({ title: e.title, date: localDateKey(e.examAt, timeZone), kind: "exam" as const })),
  ];
}

function cleanName(name: string): string | null {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[\u0000-\u001f<>]/g, "").trim();
  return base ? base.slice(0, 120) : null;
}

export async function previewSyllabus(userId: string, input: PreviewInput, deps: PreviewDeps = {}): Promise<PreviewResult> {
  const course = await ownedCourse(userId, input.classId);
  if (!course) return { ok: false, error: "Course not found." };
  const now = deps.now ?? new Date();
  const timeZone = resolveTimeZone(course.user.profile?.timezone);

  let text: string;
  let source: SyllabusPreview["source"];
  let pages: number | null = null;
  let truncated = false;
  let sourceName: string | null = null;
  if (input.file) {
    await logEvent(userId, "syllabus_import_started", { source: "file" });
    const extracted = await extractDocumentText(input.file.bytes);
    if (!extracted.ok) return { ok: false, error: extracted.error };
    text = extracted.text;
    source = extracted.kind;
    pages = extracted.pages;
    truncated = extracted.truncated;
    sourceName = cleanName(input.file.name);
  } else {
    await logEvent(userId, "syllabus_import_started", { source: "paste" });
    const raw = input.text ?? "";
    if (raw.length > MAX_SYLLABUS_CHARS * 1.25) return { ok: false, error: `That's longer than Rushd reads at once (${MAX_SYLLABUS_CHARS.toLocaleString("en-US")} characters). Paste just the syllabus.` };
    text = normalizeSyllabusText(raw);
    truncated = raw.trim().length > MAX_SYLLABUS_CHARS;
    source = "paste";
  }
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) return { ok: false, error: "That's too short to be a syllabus. Paste the whole thing, or upload the file." };

  const courseStart = toDateInput(course.termStart) ?? null;
  const courseEnd = toDateInput(course.termEnd) ?? null;
  const override = input.termStart && /^\d{4}-\d{2}-\d{2}$/.test(input.termStart) ? input.termStart : null;
  const options = {
    today: localDateKey(now, timeZone),
    termStart: override ?? courseStart,
    termEnd: override ? (courseEnd && courseEnd > override ? courseEnd : null) : courseEnd,
  };
  let draft: SyllabusDraft | null = null;
  const aiNotes: string[] = [];
  if (deps.aiAvailable ?? aiEnabled) {
    const reservation = await reserveAi(userId, "syllabus_import", now);
    if (!reservation.ok) {
      aiNotes.push(`${reservation.message} Rushd read your syllabus with its built-in reader instead.`);
    } else {
      let usage: CallUsage | undefined;
      const result = await (deps.provider ?? aiProvider).extractSyllabus(
        { text: text.slice(0, 40_000), courseName: course.name, termStart: options.termStart, termEnd: options.termEnd, today: options.today },
        (callUsage) => {
          usage = callUsage;
        },
      );
      if (usage) await settleAi(reservation.usageId, usage.model, usage);
      else await failAi(reservation.usageId, "no_response");
      if (result) draft = normalizeAiDraft(result, text, options);
      else aiNotes.push("AI reading didn't work this time, so Rushd used its built-in reader.");
    }
  }
  draft ??= parseSyllabus(text, options);
  draft = { ...draft, notes: [...aiNotes, ...draft.notes].slice(0, 10) };

  const [work, topics] = await Promise.all([
    existingWork(userId, course.id, timeZone),
    db.courseTopic.findMany({ where: { userId, classId: course.id }, select: { key: true } }),
  ]);
  const duplicates: SyllabusPreview["duplicates"] = {};
  for (const item of draft.assessments) {
    const match = findDuplicate(item, work);
    if (match) duplicates[item.id] = match;
  }
  const topicKeys = new Set(topics.map((t) => t.key));
  const existingTopics = draft.topics.filter((t) => topicKeys.has(topicKey(t.title))).map((t) => t.id);

  await logEvent(userId, "syllabus_import_previewed", { ...previewCounts(draft, Object.keys(duplicates).length), source });

  return {
    ok: true,
    preview: {
      classId: course.id,
      className: course.name,
      draft,
      text,
      source,
      sourceName,
      pages,
      truncated,
      current: { termStart: courseStart, termEnd: courseEnd, code: course.code, teacher: course.teacher },
      duplicates,
      existingTopics,
      termStartOverride: override,
    },
  };
}

export interface ConfirmSummary {
  assignments: number;
  exams: number;
  topics: number;
  topicsSkipped: number;
  duplicatesSkipped: number;
  materialId: string;
  courseUpdated: string[];
  /** Set when the topics couldn't be added (the rest was saved). */
  topicNote: string | null;
}

export type ConfirmResult = { ok: true; summary: ConfirmSummary } | { ok: false; error: string };

function notesFor(weight: number | null, snippet: string | null, timeGiven: boolean, exam: boolean): string {
  const parts = ["Added from your syllabus."];
  if (weight !== null) parts.push(`Worth ${weight}% of your grade.`);
  if (exam && !timeGiven) parts.push("Your syllabus doesn't give a time; Rushd put it at 8:00 AM.");
  if (snippet) parts.push(`Syllabus line: “${snippet.slice(0, 300)}”`);
  return parts.join(" ").slice(0, 2000);
}

/** Saves what the student kept on the review screen. Nothing is written before this. */
export async function confirmSyllabusImport(userId: string, raw: ConfirmSyllabusInput, now: Date = new Date()): Promise<ConfirmResult> {
  const parsed = ConfirmSyllabusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Some of the details aren't valid." };
  const input = parsed.data;

  const course = await ownedCourse(userId, input.classId);
  if (!course) return { ok: false, error: "Course not found." };
  const timeZone = resolveTimeZone(course.user.profile?.timezone);

  const termStart = input.course.termStart ?? toDateInput(course.termStart) ?? null;
  const termEnd = input.course.termEnd ?? toDateInput(course.termEnd) ?? null;
  if (termStart && termEnd && termEnd < termStart) return { ok: false, error: "The term can't end before it starts." };

  const topicCount = await db.courseTopic.count({ where: { userId, classId: course.id } });
  if (topicCount + input.topics.length > MAX_TOPICS_PER_COURSE) {
    return { ok: false, error: `A course can have up to ${MAX_TOPICS_PER_COURSE} topics. Leave some out and try again.` };
  }

  // Duplicates are checked again here, against the course's work right now and within this import.
  const work = await existingWork(userId, course.id, timeZone);
  const assignmentRows: Prisma.AssignmentCreateManyInput[] = [];
  const examRows: Prisma.ExamCreateManyInput[] = [];
  let duplicatesSkipped = 0;
  for (const item of input.assessments) {
    if (!item.allowDuplicate && findDuplicate(item, work)) {
      duplicatesSkipped += 1;
      continue;
    }
    const kind = savedAs(item.type);
    work.push({ title: item.title, date: item.date, kind });
    const exam = kind === "exam";
    const minuteOfDay = item.time ? Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) : exam ? 8 * 60 : 23 * 60 + 59;
    const at = zonedTimeToUtc(item.date, minuteOfDay, timeZone);
    const priority = item.weight !== null && item.weight >= 20 ? "HIGH" : "MEDIUM";
    const notes = notesFor(item.weight, item.snippet, item.time !== null, exam);
    if (exam) {
      examRows.push({ userId, classId: course.id, title: item.title, examAt: at, prepMinutes: defaultMinutes(item.type), priority, notes, importOrigin: "SYLLABUS" });
    } else {
      assignmentRows.push({
        userId,
        classId: course.id,
        title: item.title,
        dueAt: at,
        estimatedMinutes: defaultMinutes(item.type),
        estimatedByRushd: true,
        priority,
        notes,
        importOrigin: "SYLLABUS",
      });
    }
  }

  const text = normalizeSyllabusText(input.text);
  const outline: SyllabusOutline = { objectives: input.objectives, grading: input.grading };
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 32);
  const title = input.sourceName ? `Syllabus — ${input.sourceName}` : "Syllabus";
  const courseData: Prisma.ClassUpdateManyMutationInput = {};
  const courseUpdated: string[] = [];
  if (input.course.termStart) {
    courseData.termStart = new Date(`${input.course.termStart}T00:00:00Z`);
    courseUpdated.push("term start");
  }
  if (input.course.termEnd) {
    courseData.termEnd = new Date(`${input.course.termEnd}T00:00:00Z`);
    courseUpdated.push("term end");
  }
  if (input.course.code) {
    courseData.code = input.course.code;
    courseUpdated.push("course code");
  }
  if (input.course.instructor) {
    courseData.teacher = input.course.instructor;
    courseUpdated.push("instructor");
  }

  const material = { title: title.slice(0, 200), body: text, outline: outline as unknown as Prisma.InputJsonValue, postedAt: now, syncedAt: now };
  const [savedMaterial] = await db.$transaction([
    db.courseMaterial.upsert({
      where: { userId_canvasCourseId_kind_canvasId: { userId, canvasCourseId: SYLLABUS_MATERIAL_MARKER, kind: "SYLLABUS", canvasId: `${course.id}:${hash}` } },
      create: { userId, classId: course.id, canvasCourseId: SYLLABUS_MATERIAL_MARKER, kind: "SYLLABUS", canvasId: `${course.id}:${hash}`, ...material },
      update: material,
      select: { id: true },
    }),
    db.assignment.createMany({ data: assignmentRows }),
    db.exam.createMany({ data: examRows }),
    // Scoped by userId too: another student's course matches nothing.
    db.class.updateMany({ where: { id: course.id, userId }, data: courseData }),
  ]);

  // Topics go through the learning core: proposed, then confirmed, since the student reviewed them.
  let topics = 0;
  let topicsSkipped = 0;
  let topicNote: string | null = null;
  if (input.topics.length > 0) {
    const proposed = await proposeTopics(userId, course.id, input.topics, "SYLLABUS");
    if (proposed.ok) {
      topicsSkipped = proposed.skipped;
      if (proposed.ids.length > 0) {
        const confirmed = await confirmTopics(userId, course.id, proposed.ids);
        topics = confirmed.ok ? confirmed.confirmed : 0;
      }
    } else {
      topicNote = proposed.error;
    }
  }

  await logEvent(userId, "syllabus_import_confirmed", {
    method: input.method,
    assignments: assignmentRows.length,
    exams: examRows.length,
    topics,
    topicsSkipped,
    duplicatesSkipped,
    excluded: input.excluded,
    objectives: input.objectives.length,
    courseFields: courseUpdated.length,
  });
  if (assignmentRows.length + examRows.length > 0) await regeneratePlanSnapshot(userId);

  return {
    ok: true,
    summary: {
      assignments: assignmentRows.length,
      exams: examRows.length,
      topics,
      topicsSkipped,
      duplicatesSkipped,
      materialId: savedMaterial.id,
      courseUpdated,
      topicNote,
    },
  };
}

