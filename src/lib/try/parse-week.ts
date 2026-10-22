import { fallbackParseQuickAdd } from "@/lib/ai/fallback-parse";
import { CLASS_COLORS } from "@/lib/class-colors";
import type { WorkItem } from "@/lib/planning/types";

// "Rank my week" on the homepage: a visitor types their week, one item per
// line, and the real planner ranks it. Runs entirely in the browser (nothing
// typed is sent anywhere), using the same deterministic parser as quick-add.
// The parsed items can be carried into a new account after signup.

export const TRY_MAX_ITEMS = 15;
export const TRY_MAX_LINE = 160;
export const TRY_STORAGE_KEY = "rushd:try-week";

export interface TryItem {
  kind: "assignment" | "exam";
  title: string;
  className: string;
  dueAt: string; // ISO
  minutes: number;
  /** No day was recognized, so the item was given a week. */
  assumedDate: boolean;
}

// First match wins, so specific subjects come before general ones.
const SUBJECTS: [RegExp, string][] = [
  [/\bpre-?calc(ulus)?\b/i, "Precalculus"],
  [/\bcalc(ulus)?\b/i, "Calculus"],
  [/\bchem(istry)?\b|\btitration\b/i, "Chemistry"],
  [/\bbio(logy)?\b/i, "Biology"],
  [/\bphysics\b/i, "Physics"],
  [/\balgebra\b/i, "Algebra"],
  [/\bgeometry\b/i, "Geometry"],
  [/\bstat(s|istics)\b/i, "Statistics"],
  [/\bmath\b|\bproblem set\b|\bpset\b/i, "Math"],
  [/\bapush\b|\bdbq\b|\bhistory\b/i, "History"],
  [/\bgov(ernment)?\b|\bcivics\b/i, "Government"],
  [/\becon(omics)?\b/i, "Economics"],
  [/\bpsych(ology)?\b/i, "Psychology"],
  [/\b(spanish|french|german|latin|arabic|chinese|japanese|mandarin)\b/i, ""],
  [/\benglish\b|\blit(erature)?\b|\bgatsby\b|\bessay\b/i, "English"],
  [/\bcs\b|\bcoding\b|\bprogramming\b|\bcomputer science\b/i, "Computer Science"],
];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessClass(text: string): string {
  for (const [re, name] of SUBJECTS) {
    const m = text.match(re);
    if (m) return name || titleCase(m[0].toLowerCase());
  }
  return "General";
}

/** Splits "Chem: lab report Thu 2h" into a class and the rest. */
function splitPrefix(line: string): { className: string | null; rest: string } {
  const m = line.match(/^\s*([^:]{1,30}):\s*(.+)$/);
  if (!m || /\d{1,2}:\d{2}/.test(line.slice(0, m[1].length + 3))) return { className: null, rest: line };
  return { className: titleCase(m[1].trim()), rest: m[2] };
}

export function parseWeek(text: string, now: Date): TryItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, TRY_MAX_ITEMS);

  return lines.map((raw) => {
    const line = raw.slice(0, TRY_MAX_LINE);
    const { className, rest } = splitPrefix(line);
    const draft = fallbackParseQuickAdd(rest, [], now);
    const assumedDate = draft.dueAt === null;
    const due = assumedDate ? new Date(now.getTime() + 7 * 86_400_000) : new Date(draft.dueAt!);
    return {
      kind: draft.kind,
      title: draft.title.slice(0, 120),
      className: className ?? guessClass(line),
      dueAt: due.toISOString(),
      minutes: Math.min(600, Math.max(10, draft.minutes)),
      assumedDate,
    };
  });
}

/** Planner input for the parsed items; classes get stable palette colors. */
export function toWorkItems(items: TryItem[]): WorkItem[] {
  const classes = [...new Set(items.map((i) => i.className))];
  return items.map((i, idx) => {
    const c = classes.indexOf(i.className);
    return {
      kind: i.kind,
      id: `try-${idx}`,
      classId: `class-${c}`,
      title: i.title,
      className: i.className,
      classColor: CLASS_COLORS[c % CLASS_COLORS.length].value,
      priority: "MEDIUM",
      classPriority: "MEDIUM",
      dueAt: new Date(i.dueAt),
      remainingMinutes: i.minutes,
      rawEstimatedMinutes: i.minutes,
      estimateAdjusted: false,
    };
  });
}
