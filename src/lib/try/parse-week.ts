import { fallbackParseQuickAdd } from "@/lib/ai/fallback-parse";
import { CLASS_COLORS } from "@/lib/class-colors";
import type { WorkItem } from "@/lib/planning/types";

// "Rank my week" on the homepage: a visitor types their week, one item per
// line, and the real planner ranks it. It runs entirely in the browser, using
// the same parser as quick-add. The items can be carried into a new account.

export const TRY_MAX_ITEMS = 15;
const TRY_MAX_LINE = 160;
const MAX_TITLE_LENGTH = 120;
const MIN_MINUTES = 10;
const MAX_MINUTES = 600;
/** Items with no recognizable day are given one week. */
const ASSUMED_DUE_MS = 7 * 86_400_000;
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
  for (const [pattern, name] of SUBJECTS) {
    const match = text.match(pattern);
    if (match) {
      // An empty name means "use the matched word", e.g. "Spanish".
      if (name) return name;
      return titleCase(match[0].toLowerCase());
    }
  }
  return "General";
}

/** Splits "Chem: lab report Thu 2h" into a class and the rest. */
function splitPrefix(line: string): { className: string | null; rest: string } {
  const match = line.match(/^\s*([^:]{1,30}):\s*(.+)$/);
  if (!match) return { className: null, rest: line };

  // "4:30 study group" is a time, not a class name.
  const prefixArea = line.slice(0, match[1].length + 3);
  if (/\d{1,2}:\d{2}/.test(prefixArea)) return { className: null, rest: line };

  return { className: titleCase(match[1].trim()), rest: match[2] };
}

/** Splits the text into non-empty lines, without list markers like "-", "*", "•", "1." or "2)". */
function cleanLines(text: string): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseWeek(text: string, now: Date): TryItem[] {
  const lines = cleanLines(text).slice(0, TRY_MAX_ITEMS);

  const items: TryItem[] = [];
  for (const fullLine of lines) {
    const line = fullLine.slice(0, TRY_MAX_LINE);
    const { className, rest } = splitPrefix(line);
    const draft = fallbackParseQuickAdd(rest, [], now);

    const assumedDate = draft.dueAt === null;
    let due: Date;
    if (draft.dueAt === null) {
      due = new Date(now.getTime() + ASSUMED_DUE_MS);
    } else {
      due = new Date(draft.dueAt);
    }

    items.push({
      kind: draft.kind,
      title: draft.title.slice(0, MAX_TITLE_LENGTH),
      className: className ?? guessClass(line),
      dueAt: due.toISOString(),
      minutes: clamp(draft.minutes, MIN_MINUTES, MAX_MINUTES),
      assumedDate,
    });
  }
  return items;
}

/** Planner input for the parsed items. Each class gets a stable palette color. */
export function toWorkItems(items: TryItem[]): WorkItem[] {
  // Number the classes in the order they first appear.
  const classIndexByName = new Map<string, number>();
  for (const item of items) {
    if (!classIndexByName.has(item.className)) {
      classIndexByName.set(item.className, classIndexByName.size);
    }
  }

  const workItems: WorkItem[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const classIndex = classIndexByName.get(item.className) ?? 0;
    workItems.push({
      kind: item.kind,
      id: `try-${index}`,
      classId: `class-${classIndex}`,
      title: item.title,
      className: item.className,
      classColor: CLASS_COLORS[classIndex % CLASS_COLORS.length].value,
      priority: "MEDIUM",
      classPriority: "MEDIUM",
      dueAt: new Date(item.dueAt),
      remainingMinutes: item.minutes,
      rawEstimatedMinutes: item.minutes,
      estimateAdjusted: false,
    });
  }
  return workItems;
}
