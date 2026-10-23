/** Where today falls in a course's term. Dates are "YYYY-MM-DD" in the student's time zone. */
export type TermProgress =
  | { state: "upcoming" }
  | { state: "running"; percent: number; week: number; weeks: number }
  | { state: "ended" };

function dayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Null unless the course has both a start and an end date. */
export function termProgress(termStart: string | undefined, termEnd: string | undefined, today: string): TermProgress | null {
  if (!termStart || !termEnd) return null;
  const start = dayNumber(termStart);
  const end = dayNumber(termEnd);
  const now = dayNumber(today);
  if (end < start) return null;
  if (now < start) return { state: "upcoming" };
  if (now > end) return { state: "ended" };
  const totalDays = end - start + 1;
  const elapsedDays = now - start + 1;
  return {
    state: "running",
    percent: Math.round((elapsedDays / totalDays) * 100),
    week: Math.ceil(elapsedDays / 7),
    weeks: Math.ceil(totalDays / 7),
  };
}
