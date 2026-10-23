import "server-only";
import { db } from "@/lib/db";
import { ClassSchema, type ClassData, type ClassInput } from "@/lib/validation/classes";

// Creating, editing, archiving, and restoring a student's courses. Every write
// is scoped to the student's own userId, so someone else's course matches
// nothing. Archiving never deletes anything: assignments, exams, materials,
// and study history stay attached and come back on restore.

export type CourseResult = { ok: true; id: string } | { ok: false; error: string };

/** "2026-08-25" → a date at midnight UTC (stored as a plain date). */
function toDate(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

/** Form values → database columns. Blank fields are saved as empty (null), so they can be cleared. */
export function toColumns(data: ClassData) {
  return {
    name: data.name,
    teacher: data.teacher || null,
    period: data.period || null,
    color: data.color,
    priority: data.priority,
    level: data.level ?? null,
    code: data.code ?? null,
    institution: data.institution ?? null,
    subject: data.subject ?? null,
    termStart: toDate(data.termStart),
    termEnd: toDate(data.termEnd),
    weeklyHours: data.weeklyHours ?? null,
    catalogId: data.catalogId ?? null,
  };
}

function validate(input: ClassInput): { ok: true; data: ClassData } | { ok: false; error: string } {
  const parsed = ClassSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  return { ok: true, data: parsed.data };
}

export async function createCourse(userId: string, input: ClassInput): Promise<CourseResult> {
  const checked = validate(input);
  if (!checked.ok) return checked;
  const created = await db.class.create({ data: { userId, ...toColumns(checked.data) }, select: { id: true } });
  return { ok: true, id: created.id };
}

/**
 * Adds several courses at once (the multi-course picker). All or nothing:
 * one invalid course adds none. New courses continue the color rotation.
 */
export async function createCourses(userId: string, inputs: ClassInput[]): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  if (inputs.length === 0) return { ok: false, error: "Pick at least one course." };
  if (inputs.length > 20) return { ok: false, error: "That's a lot at once. Add up to 20 courses at a time." };
  const rows: ClassData[] = [];
  for (const input of inputs) {
    const checked = validate(input);
    if (!checked.ok) return { ok: false, error: `${input.name || "A course"}: ${checked.error}` };
    rows.push(checked.data);
  }
  const ids = await db.$transaction(
    rows.map((data) => db.class.create({ data: { userId, ...toColumns(data) }, select: { id: true } })),
  );
  return { ok: true, ids: ids.map((row) => row.id) };
}

export async function updateCourse(userId: string, id: string, input: ClassInput): Promise<CourseResult> {
  const checked = validate(input);
  if (!checked.ok) return checked;
  const result = await db.class.updateMany({ where: { id, userId }, data: toColumns(checked.data) });
  if (result.count === 0) return { ok: false, error: "Class not found." };
  return { ok: true, id };
}

export async function setCourseArchived(userId: string, id: string, archived: boolean): Promise<CourseResult> {
  const result = await db.class.updateMany({ where: { id, userId }, data: { archived } });
  if (result.count === 0) return { ok: false, error: "Class not found." };
  return { ok: true, id };
}

/** "2026-08-25" for a date input, from a stored date. */
export function toDateInput(date: Date | null): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}
