import { catalogRecord } from "@/lib/courses/catalog";
import { scoreText, tokenize } from "@/lib/courses/catalog/search";
import { parseWeek, type TryItem } from "@/lib/try/parse-week";

// The "add your work" step of onboarding: lines typed in the same format as
// "Rank my week" ("Chem: lab report Thursday 2h"), matched to the courses the
// student just picked. Anything that matches none of them can become a new
// course named after its prefix, the way Today's "What's due" box works.

export interface WorkCourse {
  title: string;
  catalogId: string | null;
}

/** Which picked course a line belongs to: by its prefix or guessed subject, then by its words. -1 if none. */
export function matchCourse(item: Pick<TryItem, "className" | "title">, courses: WorkCourse[]): number {
  let best = -1;
  let bestScore = 0;
  courses.forEach((course, index) => {
    const record = catalogRecord(course.catalogId);
    const names = [course.title, ...(record?.aliases ?? [])];
    let score = item.className && item.className !== "General" ? scoreText(item.className, names) * 2 : 0;
    // Otherwise a distinctive word of the line ("robotics") that names the course.
    if (score === 0) score = tokenize(item.title).some((word) => word.length >= 4 && scoreText(word, names) >= 0.8) ? 1 : 0;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

export type WorkCourseChoice = { index: number } | { newName: string };

export interface WorkDraft {
  id: string;
  kind: "assignment" | "exam";
  title: string;
  dueAt: string;
  minutes: number;
  /** No day was recognized, so it was given a week. */
  assumedDate: boolean;
  course: WorkCourseChoice;
}

let counter = 0;

/** Work drafts from parsed lines (or a week saved on the homepage), each matched to a course. */
export function toDrafts(items: TryItem[], courses: WorkCourse[]): WorkDraft[] {
  return items.map((item) => {
    counter += 1;
    const index = matchCourse(item, courses);
    let course: WorkCourseChoice;
    if (index >= 0) course = { index };
    else if (item.className && item.className !== "General") course = { newName: item.className };
    else if (courses.length > 0) course = { index: 0 };
    else course = { newName: "General" };
    return { id: `w${counter}`, kind: item.kind, title: item.title, dueAt: item.dueAt, minutes: item.minutes, assumedDate: item.assumedDate, course };
  });
}

export function parseWork(text: string, courses: WorkCourse[], now: Date): WorkDraft[] {
  return toDrafts(parseWeek(text, now), courses);
}
