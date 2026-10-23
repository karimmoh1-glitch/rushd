/** One finished study session, with the course it belonged to (through its assignment or exam). */
export interface CourseSession {
  actualMinutes: number | null;
  plannedMinutes: number;
  assignment: { classId: string } | null;
  exam: { classId: string } | null;
}

export interface CourseStudyTime {
  id: string;
  name: string;
  color: string;
  minutes: number;
  /** The student's own weekly goal, in minutes; null when they haven't set one. */
  goalMinutes: number | null;
}

/**
 * Real study time per course from finished sessions, next to each course's
 * weekly goal. Courses with neither a goal nor any study time are left out,
 * so the list only shows what the student has data for.
 */
export function studyTimeByCourse(
  classes: { id: string; name: string; color: string; weeklyHours: number | null }[],
  sessions: CourseSession[],
): CourseStudyTime[] {
  const minutesByClass = new Map<string, number>();
  for (const session of sessions) {
    const classId = session.assignment?.classId ?? session.exam?.classId;
    if (!classId) continue;
    const minutes = session.actualMinutes ?? session.plannedMinutes;
    minutesByClass.set(classId, (minutesByClass.get(classId) ?? 0) + minutes);
  }

  const rows: CourseStudyTime[] = [];
  for (const course of classes) {
    const minutes = minutesByClass.get(course.id) ?? 0;
    const goalMinutes = course.weeklyHours ? course.weeklyHours * 60 : null;
    if (minutes === 0 && goalMinutes === null) continue;
    rows.push({ id: course.id, name: course.name, color: course.color, minutes, goalMinutes });
  }
  return rows;
}
