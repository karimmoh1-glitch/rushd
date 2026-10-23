import {
  dayInWeek,
  dayName,
  findDateTokens,
  findDocTerm,
  formatKey,
  mondayOf,
  resolveMonthDay,
  timeOfDay,
  weekSpan,
  type DateToken,
  type MonthDay,
  type ResolvedDate,
  type YearContext,
} from "./dates";
import { addDaysToKey, dayOfWeekForKey } from "@/lib/time/zone";
import type {
  AssessmentType,
  Confidence,
  DraftAssessment,
  DraftCourse,
  DraftField,
  DraftObjective,
  DraftTopic,
  GradingEntry,
  SourceRef,
  SyllabusDraft,
} from "./types";

// The rules-based syllabus reader. Works with AI off (as in production): it
// reads course details, assessments, the weekly schedule, topics, and learning
// objectives from plain text, line by line, and records for every item how
// sure it is and which line it came from. It never fills a gap with a guess
// it doesn't flag: a missing year, a week without a day, "TBA", a weekday that
// doesn't match its date, or two dates for the same exam all become issues
// the student sees before anything is saved.

export interface ParseOptions {
  /** Today in the student's calendar, YYYY-MM-DD. */
  today: string;
  /** The course's own term dates from Rushd, if the student set them. */
  termStart?: string | null;
  termEnd?: string | null;
}

export const MAX_SYLLABUS_CHARS = 80_000;

const BULLET_RE = /^[\s]*(?:[•◦▪▫●○■□►▸‣⁃*·–—-]|\(?\d{1,2}[.)]|\(?[ivx]{1,4}[.)]|[a-h][.)])\s+/i;

interface Line {
  n: number; // 1-based
  raw: string;
  text: string; // without bullet / markdown
  bullet: boolean;
  indent: number;
}

type Section = "header" | "objectives" | "schedule" | "topics" | "dates" | "grading" | "other";

const SECTION_PATTERNS: [Section, RegExp][] = [
  ["objectives", /^(?:course |student |learning |key )*(?:objectives|outcomes|goals|aims)\b|^what you(?:'|’)?ll learn|^by the end of (?:this|the) course/i],
  ["schedule", /^(?:weekly |course |class |tentative |reading |lecture |semester |unit )*(?:schedule|calendar|outline|plan|agenda)\b/i],
  ["topics", /^(?:course |major )?(?:topics|units|modules|content|topics covered|units of study)\b/i],
  ["dates", /^(?:important |key |due |major )?(?:dates|deadlines|assignments|assessments|exams?|tests?|exam schedule|due dates|major assignments)\b/i],
  ["grading", /^(?:grading|grades|grade (?:breakdown|distribution|weights)|evaluation|course requirements|requirements|weights|assessment weights)\b/i],
  [
    "other",
    /^(?:late (?:work|policy|assignments)|attendance|academic (?:integrity|honesty)|office hours|materials|required (?:texts?|materials)|textbooks?|contact|accommodations|course description|description|policies|classroom (?:expectations|policies)|communication|prerequisites?|technology|course policies|disability|plagiarism|about (?:this|the) course|overview|welcome)\b/i,
  ],
];

const ASSESSMENT_RE =
  /\b(?:assignments?|homework|hw\s*#?\d*|problem\s*sets?|psets?|p\.?s\.?\s*#?\d+|worksheets?|quiz(?:zes)?|tests?|exams?|midterms?|final(?=\s*[:\-–—(]|\s+(?:exam|paper|project|essay|presentation|portfolio|report)\b|\s+on\b|\s*$)|labs?|lab reports?|projects?|milestones?|proposals?|presentations?|essays?|papers?|reports?|reflections?|portfolios?|dbqs?|frqs?|drafts?|responses?)\b/i;

const POLICY_RE =
  /\b(?:late|lose|loses|lowest|dropped?|may be|will be|must|policy|policies|make-?ups?|extensions?|integrity|plagiarism|accommodations?|penalty|penalized|excused|absences?|each week|per day|should expect|expected to|are graded|is graded|counts? toward)\b/i;

const SKIP_TOPIC_RE =
  /^(?:no class(?:es)?|no school|holiday|.*\bbreak\b.*|.*\bno class\b.*|review|exam review|final review|midterm review|review session|introductions?|course introduction|syllabus(?: day)?|catch[- ]up(?: day)?|reading day|study day|tba|tbd|finals?(?: week)?|midterm|exam|work day|flex day)\s*[.!]?$/i;

const INSTRUCTION_RE = /^(?:bring|submit|turn in|hand in|see|meet|watch|complete|finish|prepare|email|check|note:)\b/i;
const READING_RE = /^(?:read|reading|readings|required reading|text|textbook)\b\s*[:\-–]?\s*/i;

function cleanLine(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\*\*|__|^#{1,6}\s*/g, "")
    .replace(/\s+$/g, "");
}

/** Normalizes text the same way for parsing, storing, and line numbers. */
export function normalizeSyllabusText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_SYLLABUS_CHARS);
}

function toLines(text: string): Line[] {
  return text.split("\n").map((raw, i) => {
    const cleaned = cleanLine(raw);
    const indent = cleaned.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0;
    const bulletMatch = cleaned.match(BULLET_RE);
    // A dash bullet needs a space after it; "-5 points" isn't a bullet.
    const bullet = Boolean(bulletMatch);
    const body = bullet ? cleaned.slice(bulletMatch![0].length) : cleaned;
    return { n: i + 1, raw, text: body.trim(), bullet, indent };
  });
}

function snippetOf(line: Line): SourceRef {
  return { line: line.n, snippet: line.raw.trim().slice(0, 300) };
}

function sectionOf(text: string): Section | null {
  if (text.length > 60) return null;
  for (const [section, re] of SECTION_PATTERNS) {
    const match = text.match(re);
    if (!match) continue;
    const rest = text.slice(match[0].length).trim();
    // "Weekly Schedule (tentative)" is a heading; "Grading: homework 30% / ..." is content.
    if (rest.length === 0 || /^\(.*\)$/.test(rest) || (rest.length <= 25 && !/\d/.test(rest) && !rest.includes(":"))) return section;
    if (/^:\s*$/.test(rest)) return section;
  }
  return null;
}

function minConfidence(...values: Confidence[]): Confidence {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function removeSpans(text: string, spans: { index: number; end: number }[]): string {
  let out = text;
  for (const span of [...spans].sort((a, b) => b.index - a.index)) {
    out = `${out.slice(0, span.index)} ${out.slice(span.end)}`;
  }
  return out;
}

const DANGLING_END = /(?:[\s,:;–—\-/(]|\b(?:due|by|on|at|date|in|the|of|for|from|is|are|week|moved to|rescheduled to|changed to|postponed to))+$/i;
const DANGLING_START = /^(?:[\s,:;–—\-/)]|\b(?:due|on|by|at)\b)+/i;

function cleanTitle(text: string): string {
  let title = text
    .replace(/\((?:see|per|check|as)\b[^)]*\)/gi, " ")
    .replace(/\b(?:moved|rescheduled|changed|postponed)\s+to\b/gi, " ")
    .replace(/\(\s*\d{1,3}(?:\.\d+)?\s*%\s*(?:of (?:the |your )?(?:final )?grade)?\s*\)/gi, " ")
    .replace(/\b(?:worth\s+)?\d{1,3}(?:\.\d+)?\s*%(?:\s*of (?:the |your )?(?:final )?grade)?/gi, " ")
    .replace(/\(\s*[,;:\s]*\)/g, " ")
    .replace(/\s*,\s*(?:,\s*)+/g, ", ")
    .replace(/\s{2,}/g, " ");
  for (let i = 0; i < 4; i++) {
    title = title.replace(DANGLING_END, "").replace(DANGLING_START, "").trim();
  }
  title = title.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return capitalize(title).slice(0, 160);
}

function assessmentType(title: string): AssessmentType {
  const t = title.toLowerCase();
  const finalOf = t.match(/\bfinal\s+(paper|essay|project|presentation|portfolio|report)\b/);
  if (finalOf) {
    const noun = finalOf[1];
    if (noun === "project" || noun === "portfolio") return "project";
    if (noun === "presentation") return "presentation";
    return "paper";
  }
  if (/\bfinal\b/.test(t)) return "final";
  if (/\bmidterms?\b/.test(t)) return "midterm";
  if (/\bquiz(?:zes)?\b/.test(t)) return "quiz";
  if (/\b(?:exams?|tests?)\b/.test(t)) return "exam";
  if (/\blabs?\b/.test(t)) return "lab";
  if (/\bpresentations?\b/.test(t)) return "presentation";
  if (/\b(?:essays?|papers?|responses?|reflections?|dbqs?)\b/.test(t)) return "paper";
  if (/\b(?:projects?|milestones?|proposals?|portfolios?)\b/.test(t)) return "project";
  return "assignment";
}

/** A title that names one specific thing ("Quiz 3", "Midterm", "Lab 2: Titration"), not just a kind. */
function isSpecificTitle(title: string, type: AssessmentType): boolean {
  if (/\d/.test(title)) return true;
  if (type === "midterm" || type === "final") return true;
  return titleKey(title).split(" ").length >= 3;
}

function isGenericTitle(title: string): boolean {
  return /^(?:assignments?|homework|hw|quiz(?:zes)?|tests?|exams?|labs?|projects?|papers?|essays?|reports?|drafts?|responses?)$/i.test(titleKey(title));
}

/** Identity for merging repeated mentions: an unnumbered midterm/final is one event. */
function identityKey(title: string, type: AssessmentType): string {
  if ((type === "midterm" || type === "final") && !/\d/.test(title)) return `#${type}`;
  return titleKey(title);
}

function splitSegments(text: string): string[] {
  return text
    .split(/\s*[;|]\s*|\t+|\s{3,}|\s{2,}(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface WeekContext {
  week: number;
  start: string | null;
  end: string | null;
  confidence: Confidence;
  issues: string[];
}

interface RowDate {
  date: string;
  confidence: Confidence;
  issues: string[];
  raw: string;
}

// ---------------------------------------------------------------------------
// Course details
// ---------------------------------------------------------------------------

const CODE_RE = /\b([A-Z]{2,5})[ \-]?(\d{3,4}[A-Z]?)\b/;
const CODE_STOP = new Set(["FALL", "SPRING", "SUMMER", "WINTER", "ROOM", "PAGE", "WEEK", "UNIT", "HALL", "SUITE", "BLDG", "AUTUMN", "AND", "THE", "NOTE", "CH", "TERM", "YEAR", "CRN", "SEC", "ZIP", "PO", "BOX"]);
const INSTRUCTOR_RE = /^(?:course\s+)?(?:instructor|professor|prof\.?|teacher|lecturer|taught by|faculty|instructors)\s*[:\-–—]\s*(.+)$/i;
const TERM_START_RE = /\b(?:classes|class|instruction|term|semester|quarter|course|school)\s+(?:begins?|starts?)\b|\bfirst day of (?:classes|class|instruction|school|the term|the semester|the quarter)\b|\b(?:term|semester) start\b/i;
const TERM_END_RE = /\b(?:classes|class|instruction|term|semester|quarter|course|school)\s+ends?\b|\blast day of (?:classes|class|instruction|school|the term|the semester|the quarter)\b|\b(?:term|semester) end\b/i;
const TERM_SPAN_RE = /^(?:term|semester|dates|course dates|term dates)\s*[:\-–—]/i;

function field(value: string, confidence: Confidence, line: Line, issues: string[] = []): DraftField {
  return { value: value.slice(0, 200), confidence, issues, source: snippetOf(line) };
}

function firstDate(tokens: DateToken[]): MonthDay | null {
  for (const token of tokens) {
    if (token.kind === "date") return token.value;
    if (token.kind === "range") return token.start;
  }
  return null;
}

function readCourse(lines: Line[], ctx: YearContext): DraftCourse {
  const course: DraftCourse = { title: null, code: null, instructor: null, term: null, termStart: null, termEnd: null };
  const top = lines.filter((l) => l.text).slice(0, 12);

  for (const line of top) {
    if (course.code) break;
    const match = line.text.match(CODE_RE);
    if (match && !CODE_STOP.has(match[1]) && !/^20\d{2}$/.test(match[2])) {
      course.code = field(`${match[1]} ${match[2]}`, "high", line);
    }
  }

  for (const line of lines) {
    const match = line.text.match(INSTRUCTOR_RE);
    if (!match) continue;
    const name = match[1].split(/\s*(?:[,|·(<]|\s[-–—]\s|\bemail\b|\boffice\b|\S+@\S+)/i)[0].trim();
    if (name.length >= 2 && name.length <= 80) course.instructor = field(name, "high", line);
    break;
  }

  for (const line of top) {
    const term = line.text.match(/\b(?:fall|autumn|spring|summer|winter)\s+(?:semester\s+|term\s+|quarter\s+|session\s+)?20\d{2}\b|\b20\d{2}\s*[-–—/]\s*(?:20)?\d{2}\s+(?:school|academic)\s+year\b/i);
    if (term) {
      course.term = field(capitalize(term[0]), "high", line);
      break;
    }
  }

  // Title: the first substantial line near the top that isn't the instructor, term, or a contact line.
  for (const [index, line] of top.slice(0, 6).entries()) {
    if (INSTRUCTOR_RE.test(line.text) || /@|https?:|\bphone\b|\broom\b|\boffice\b/i.test(line.text)) continue;
    let title = line.text;
    const code = course.code && title.includes(course.code.value.replace(" ", "")) ? course.code.value.replace(" ", "") : course.code?.value;
    if (code && title.toUpperCase().includes(code.toUpperCase())) {
      title = title.replace(new RegExp(code.replace(" ", "[ \\-]?"), "i"), " ");
    }
    title = title
      .replace(/\b(?:course\s+)?syllabus\b/gi, " ")
      .replace(/\b(?:fall|autumn|spring|summer|winter)\s+(?:semester\s+|term\s+)?20\d{2}\b/gi, " ")
      .replace(/^[\s:\-–—|,]+|[\s:\-–—|,]+$/g, "")
      .replace(/\s*[\-–—|]\s*$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (title.length < 3 || title.length > 120 || sectionOf(title)) continue;
    course.title = field(title, index <= 2 ? "high" : "medium", line);
    break;
  }

  for (const line of lines) {
    if (!line.text) continue;
    const sentences = line.text.split(/(?<=[.;])\s+/);
    for (const sentence of sentences) {
      const tokens = findDateTokens(sentence);
      const range = tokens.find((t) => t.kind === "range");
      if (TERM_SPAN_RE.test(sentence) && range && range.kind === "range") {
        const start = resolveMonthDay(range.start, ctx);
        const end = resolveMonthDay(range.finish, ctx);
        if (start.date && !course.termStart) course.termStart = field(start.date, start.confidence, line, start.issues);
        if (end.date && !course.termEnd) course.termEnd = field(end.date, end.confidence, line, end.issues);
        continue;
      }
      const md = firstDate(tokens);
      if (!md) continue;
      if (!course.termStart && TERM_START_RE.test(sentence)) {
        const resolved = resolveMonthDay(md, ctx);
        if (resolved.date) course.termStart = field(resolved.date, resolved.confidence, line, resolved.issues);
      } else if (!course.termEnd && TERM_END_RE.test(sentence)) {
        const resolved = resolveMonthDay(md, ctx);
        if (resolved.date) course.termEnd = field(resolved.date, resolved.confidence, line, resolved.issues);
      }
    }
  }
  return course;
}

// ---------------------------------------------------------------------------
// The main pass
// ---------------------------------------------------------------------------

interface Anchor {
  /** Monday of week 1. */
  monday: string;
  confidence: Confidence;
  from: "course" | "syllabus-dates" | "syllabus-term";
}

function resolveToken(token: DateToken, ctx: YearContext): ResolvedDate & { end?: string | null } {
  if (token.kind === "date") return resolveMonthDay(token.value, ctx);
  if (token.kind === "range") {
    const start = resolveMonthDay(token.start, ctx);
    let end = resolveMonthDay(token.finish, ctx);
    // "Dec 28 – Jan 3": the end is in the next year.
    if (start.date && end.date && end.date < start.date && token.finish.year === null) {
      end = { ...end, date: addDaysToKey(end.date, 365) };
    }
    return { ...start, end: end.date };
  }
  return { date: null, confidence: "low", issues: [] };
}

function findAnchor(lines: Line[], ctx: YearContext, course: DraftCourse, options: ParseOptions): Anchor | null {
  if (options.termStart) return { monday: mondayOf(options.termStart), confidence: "high", from: "course" };
  for (const line of lines) {
    const tokens = findDateTokens(line.text);
    const week = tokens[0]?.kind === "week" && tokens[0].index <= 1 ? tokens[0] : null;
    if (!week || week.kind !== "week") continue;
    const dated = tokens.find((t) => t.kind === "range" || t.kind === "date");
    if (!dated) continue;
    const resolved = resolveToken(dated, ctx);
    if (!resolved.date) continue;
    return { monday: addDaysToKey(mondayOf(resolved.date), -7 * (week.week - 1)), confidence: resolved.confidence, from: "syllabus-dates" };
  }
  if (course.termStart) return { monday: mondayOf(course.termStart.value), confidence: course.termStart.confidence, from: "syllabus-term" };
  return null;
}

interface DateDecision {
  date: string | null;
  time: string | null;
  dateText: string | null;
  confidence: Confidence;
  issues: string[];
  week: number | null;
}

function decideDate(
  segmentTokens: DateToken[],
  lineTokens: DateToken[],
  rowDate: RowDate | null,
  week: WeekContext | null,
  anchor: Anchor | null,
  ctx: YearContext,
): DateDecision {
  const issues: string[] = [];
  const time = segmentTokens.find((t) => t.kind === "time") ?? lineTokens.find((t) => t.kind === "time");
  const timeText = time && time.kind === "time" ? timeOfDay(time.minutes) : null;
  const weekday = segmentTokens.find((t) => t.kind === "weekday");
  const tba = segmentTokens.find((t) => t.kind === "tba");
  const dated = segmentTokens.filter((t) => t.kind === "date" || t.kind === "range");
  const ownWeek = segmentTokens.find((t) => t.kind === "week");

  if (tba && tba.kind === "tba" && dated.length === 0) {
    return {
      date: null,
      time: null,
      dateText: tba.raw,
      confidence: "low",
      week: week?.week ?? null,
      issues: [tba.reason === "finals" ? "Scheduled for finals week — add the date from your school's exam schedule." : "Your syllabus says the date is to be announced — add it when you know."],
    };
  }

  if (dated.length > 0) {
    const first = dated[0];
    const resolved = resolveToken(first, ctx);
    issues.push(...resolved.issues);
    let date = resolved.date;
    let confidence = resolved.confidence;
    if (first.kind === "range" && resolved.end) {
      issues.push(`Your syllabus gives a range (${first.raw}) — pick the day it's due.`);
      date = resolved.end;
      confidence = minConfidence(confidence, "medium");
    }
    const distinct = new Set(dated.map((t) => resolveToken(t, ctx).date).filter(Boolean));
    if (distinct.size > 1) {
      issues.push(`Your syllabus gives more than one date here (${dated.map((t) => t.raw).join(", ")}).`);
      confidence = "low";
    }
    if (first.kind === "date" && first.numeric && first.value.month <= 12 && first.value.day <= 12 && first.value.month !== first.value.day) {
      // 10/11 could be October 11 or 10 November; Rushd reads month first.
      confidence = minConfidence(confidence, "medium");
    }
    if (date && weekday && weekday.kind === "weekday" && dayOfWeekForKey(date) !== weekday.dow) {
      issues.push(`Your syllabus says ${dayName(weekday.dow)}, but ${formatKey(date, true)} is a ${dayName(dayOfWeekForKey(date))}.`);
      confidence = "low";
    }
    return { date, time: timeText, dateText: first.raw, confidence, issues, week: week?.week ?? null };
  }

  if (rowDate) {
    return { date: rowDate.date, time: timeText, dateText: rowDate.raw, confidence: rowDate.confidence, issues: [...rowDate.issues], week: week?.week ?? null };
  }

  // A week named in the segment wins over the block it sits in.
  let context = week;
  if (ownWeek && ownWeek.kind === "week") {
    if (anchor) {
      const span = weekSpan(anchor.monday, ownWeek.week);
      context = { week: ownWeek.week, start: span.start, end: span.end, confidence: anchor.confidence, issues: [] };
    } else {
      context = { week: ownWeek.week, start: null, end: null, confidence: "low", issues: [] };
    }
  }

  if (context) {
    const weekLabel = `Week ${context.week}`;
    if (!context.start) {
      return {
        date: null,
        time: timeText,
        dateText: weekday && weekday.kind === "weekday" ? `${weekLabel}, ${weekday.raw}` : weekLabel,
        confidence: "low",
        week: context.week,
        issues: [`${weekLabel}${weekday && weekday.kind === "weekday" ? `, ${dayName(weekday.dow)}` : ""} — add the term start date so Rushd can place it, or pick the date.`],
      };
    }
    if (weekday && weekday.kind === "weekday") {
      const date = dayInWeek(mondayOf(context.start), weekday.dow);
      return {
        date,
        time: timeText,
        dateText: `${weekLabel}, ${weekday.raw}`,
        confidence: minConfidence(context.confidence, "medium"),
        week: context.week,
        issues: [...context.issues],
      };
    }
    return {
      date: context.end,
      time: timeText,
      dateText: weekLabel,
      confidence: "low",
      week: context.week,
      issues: [`Your syllabus gives only the week (${weekLabel}, ${formatKey(context.start)} – ${formatKey(context.end ?? context.start)}) — pick the day.`],
    };
  }

  if (weekday && weekday.kind === "weekday") {
    return { date: null, time: timeText, dateText: weekday.raw, confidence: "low", week: null, issues: [`Only a weekday (${dayName(weekday.dow)}) — pick the date.`] };
  }
  return { date: null, time: timeText, dateText: null, confidence: "low", week: null, issues: ["No date in your syllabus — add one, or leave it out."] };
}

const WEIGHT_RE = /(\d{1,3}(?:\.\d+)?)\s*%/;

function readWeight(text: string): number | null {
  const match = text.match(WEIGHT_RE);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 && value <= 100 ? value : null;
}

function gradingLabel(text: string): string {
  return capitalize(
    text
      .replace(/\(?\s*\d{1,3}(?:\.\d+)?\s*%\s*\)?/g, " ")
      .replace(/\b(?:worth|of (?:the |your )?(?:final )?grade)\b/gi, " ")
      .replace(/[\s.:–—\-=]+$/g, "")
      .replace(/^[\s.:–—\-=]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  ).slice(0, 120);
}

function topicTitle(text: string): string {
  return capitalize(
    text
      .replace(/^(?:unit|module|chapter|topic|lesson|part)\s*\d+[a-z]?\s*[:.\-–—)]\s*/i, "")
      .replace(/^topics?\s*[:\-–]\s*/i, "")
      .replace(/[\s.;,:\-–—]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  ).slice(0, 120);
}

function isTopicLike(text: string): boolean {
  if (text.length < 3 || text.length > 120) return false;
  if (SKIP_TOPIC_RE.test(text)) return false;
  if (INSTRUCTION_RE.test(text)) return false;
  if (POLICY_RE.test(text)) return false;
  if (!/\p{L}{3,}/u.test(text)) return false;
  // A sentence of instructions or description, not a topic name.
  if (/[.!?]$/.test(text) && text.split(/\s+/).length > 10) return false;
  return true;
}

/** How dates in this text should get their year: the course's term, the
 * syllabus's own term dates, or a term it names. Also used to check AI output. */
export function yearContextFor(input: string, options: ParseOptions): { ctx: YearContext; course: DraftCourse } {
  const text = normalizeSyllabusText(input);
  const lines = toLines(text);
  return contextFromLines(text, lines, options);
}

function contextFromLines(text: string, lines: Line[], options: ParseOptions): { ctx: YearContext; course: DraftCourse } {
  const header = lines.slice(0, 15).map((l) => l.text).join("\n");
  const docTerm = findDocTerm(header) ?? findDocTerm(text);
  const baseCtx: YearContext = {
    termStart: options.termStart ?? null,
    termEnd: options.termEnd ?? null,
    termSource: options.termStart ? "course" : null,
    docTerm,
    today: options.today,
  };
  const course = readCourse(lines, { ...baseCtx, termStart: options.termStart && options.termEnd ? options.termStart : null, termEnd: options.termStart && options.termEnd ? options.termEnd : null });
  const ctx: YearContext = { ...baseCtx };
  if (!(options.termStart && options.termEnd) && course.termStart && course.termEnd) {
    ctx.termStart = course.termStart.value;
    ctx.termEnd = course.termEnd.value;
    ctx.termSource = "syllabus";
  } else if (!ctx.termEnd && ctx.termStart) {
    ctx.termEnd = addDaysToKey(ctx.termStart, 140);
  }
  return { ctx, course };
}

export function parseSyllabus(input: string, options: ParseOptions): SyllabusDraft {
  const text = normalizeSyllabusText(input);
  const lines = toLines(text);
  const notes: string[] = [];
  const { ctx, course } = contextFromLines(text, lines, options);
  const anchor = findAnchor(lines, ctx, course, options);


  const assessments: (DraftAssessment & { key: string; order: number })[] = [];
  const topics: DraftTopic[] = [];
  const objectives: DraftObjective[] = [];
  const grading: GradingEntry[] = [];
  const topicKeys = new Set<string>();
  let usedWeeksWithoutAnchor = false;

  let section: Section = "header";
  let week: WeekContext | null = null;
  let weekTopic: string | null = null;

  const addTopic = (title: string, line: Line, confidence: Confidence, extra: Partial<DraftTopic> = {}) => {
    const clean = topicTitle(title);
    const key = titleKey(clean);
    if (!clean || !key || topicKeys.has(key) || !isTopicLike(clean)) return null;
    topicKeys.add(key);
    const topic: DraftTopic = {
      id: `t${topics.length + 1}`,
      title: clean,
      parentTitle: null,
      week: week?.week ?? null,
      startDate: week?.start ?? null,
      endDate: week?.end ?? null,
      readings: null,
      confidence,
      issues: [],
      source: snippetOf(line),
      ...extra,
    };
    topics.push(topic);
    return topic;
  };

  const addAssessment = (segment: string, segmentTokens: DateToken[], lineTokens: DateToken[], rowDate: RowDate | null, line: Line) => {
    const titleText = cleanTitle(removeSpans(segment, segmentTokens.filter((t) => t.kind !== "time" || true)));
    const type = assessmentType(titleText || segment);
    const title = titleText || capitalize(type);
    const decision = decideDate(segmentTokens, lineTokens, rowDate, week, anchor, ctx);
    if (decision.week && !anchor) usedWeeksWithoutAnchor = true;
    const titleConfidence: Confidence = isGenericTitle(title) ? "medium" : "high";
    let confidence = minConfidence(titleConfidence, decision.confidence);
    if (decision.issues.length > 0 && confidence === "high") confidence = "medium";
    const weight = readWeight(segment);
    assessments.push({
      id: `a${assessments.length + 1}`,
      key: identityKey(title, type),
      order: assessments.length,
      title,
      type,
      date: decision.date,
      time: decision.time,
      dateText: decision.dateText,
      dateConfidence: decision.date ? decision.confidence : "low",
      weight,
      week: decision.week,
      confidence,
      issues: decision.issues.slice(0, 6),
      source: snippetOf(line),
    });
  };

  for (const line of lines) {
    if (!line.text) continue;
    const heading = !line.bullet ? sectionOf(line.text.replace(/:$/, "")) : null;
    if (heading) {
      section = heading;
      week = null;
      weekTopic = null;
      continue;
    }

    let content = line.text;
    let inlineGrading = false;
    const gradingPrefix = content.match(/^(?:grading|grades|grade breakdown|weights)\s*[:\-–]\s*/i);
    if (gradingPrefix) {
      content = content.slice(gradingPrefix[0].length);
      inlineGrading = true;
    }

    const lineTokens = findDateTokens(content);
    const lead = lineTokens[0];
    let rowDate: RowDate | null = null;

    // "Week 3 (Sep 8–12): Topic" starts a new block of the schedule.
    if (lead && lead.kind === "week" && lead.index <= 1) {
      const range = lineTokens.find((t) => (t.kind === "range" || t.kind === "date") && t.index <= lead.end + 3);
      let start: string | null = null;
      let end: string | null = null;
      let confidence: Confidence = "low";
      const issues: string[] = [];
      if (range) {
        const resolved = resolveToken(range, ctx);
        start = resolved.date;
        end = resolved.end ?? (resolved.date ? addDaysToKey(mondayOf(resolved.date), 4) : null);
        confidence = resolved.confidence;
        issues.push(...resolved.issues);
      } else if (anchor) {
        const span = weekSpan(anchor.monday, lead.week);
        start = span.start;
        end = span.end;
        confidence = anchor.confidence;
      }
      week = { week: lead.week, start, end, confidence, issues };
      weekTopic = null;
      if (section !== "schedule" && section !== "topics" && section !== "dates") section = "schedule";
      const consumed = range ? Math.max(lead.end, range.end) : lead.end;
      content = content.slice(consumed).replace(/^[\s:.\-–—)]+/, "");
      if (!content) continue;
    } else if (lead && (lead.kind === "date" || lead.kind === "range" || lead.kind === "weekday") && lead.index <= 1 && section !== "dates" && section !== "grading") {
      // "Tue 9/2 | Intro to kinematics" — a dated row of a schedule table.
      const dateToken = lineTokens.find((t) => (t.kind === "date" || t.kind === "range") && t.index <= 16);
      if (dateToken) {
        const resolved = resolveToken(dateToken, ctx);
        if (resolved.date) {
          rowDate = { date: resolved.date, confidence: resolved.confidence, issues: resolved.issues, raw: dateToken.raw };
          const consumed = Math.max(dateToken.end, lead.end);
          const rest = content.slice(consumed).replace(/^[\s:.\-–—|)]+/, "");
          // A row with only a date and a topic sets the block for the lines under it.
          if (rest && !ASSESSMENT_RE.test(rest) && (section === "schedule" || section === "topics")) {
            week = { week: week?.week ?? 0, start: resolved.date, end: resolved.end ?? resolved.date, confidence: resolved.confidence, issues: resolved.issues };
          }
          content = rest;
          if (!content) continue;
        }
      }
    }

    const segments = inlineGrading ? content.split(/\s+\/\s+|\s*[;,]\s*/).filter(Boolean) : splitSegments(content);
    for (const segment of segments) {
      const tokens = findDateTokens(segment);
      const hasDateish = tokens.some((t) => t.kind === "date" || t.kind === "range" || t.kind === "tba");
      const hasDayHint = tokens.some((t) => t.kind === "weekday" || t.kind === "week");
      const weight = readWeight(segment);
      const isAssessment = ASSESSMENT_RE.test(segment);

      // Grading breakdown: a weight and no date.
      if (weight !== null && !hasDateish && !hasDayHint && (isAssessment || section === "grading" || inlineGrading)) {
        if (POLICY_RE.test(segment)) continue;
        const label = gradingLabel(segment);
        if (label && label.length <= 80) grading.push({ label, weight, source: snippetOf(line) });
        continue;
      }

      if (isAssessment) {
        if (POLICY_RE.test(segment) && !hasDateish) continue;
        if (segment.length > 160 && !hasDateish) continue;
        const inBlock = week !== null || rowDate !== null;
        const titleGuess = cleanTitle(removeSpans(segment, tokens));
        const specific = isSpecificTitle(titleGuess, assessmentType(titleGuess || segment));
        if (section === "other" || section === "header") {
          if (!hasDateish) continue;
        } else if (section === "objectives") {
          continue;
        } else if (!hasDateish && !hasDayHint && !inBlock && !specific) {
          continue;
        }
        addAssessment(segment, tokens, lineTokens, rowDate, line);
        continue;
      }

      if (READING_RE.test(segment) && (week || section === "schedule")) {
        const reading = segment.replace(READING_RE, "").trim() || segment;
        const owner = weekTopic ? topics.find((t) => t.title === weekTopic) : null;
        if (owner) owner.readings = owner.readings ? `${owner.readings}; ${reading}`.slice(0, 300) : reading.slice(0, 300);
        continue;
      }

      if (section === "objectives") {
        if (/:\s*$/.test(segment) || segment.length < 8) continue;
        const textValue = capitalize(segment.replace(/[\s;,]+$/g, "")).slice(0, 300);
        if (objectives.some((o) => titleKey(o.text) === titleKey(textValue))) continue;
        objectives.push({ id: `o${objectives.length + 1}`, text: textValue, confidence: line.bullet ? "high" : "medium", source: snippetOf(line) });
        continue;
      }

      if (week || rowDate) {
        // Inside a schedule block: the block's first topic is the week's topic; bullets under it are subtopics.
        const isSub = weekTopic !== null && line.bullet && segment === segments[0] && line.text === content;
        const created = addTopic(segment, line, week && week.start ? "high" : "medium", {
          parentTitle: isSub ? weekTopic : null,
        });
        if (created && !isSub && weekTopic === null) weekTopic = created.title;
        continue;
      }

      if (section === "topics" || (section === "schedule" && line.bullet)) {
        addTopic(segment, line, line.bullet ? "high" : "medium", { week: null, startDate: null, endDate: null });
      }
    }
  }

  // Merge repeated mentions of the same assessment; different dates become a visible conflict.
  const merged: (DraftAssessment & { key: string; order: number })[] = [];
  for (const item of assessments) {
    const same = merged.find((m) => m.key === item.key && (isSpecificTitle(m.title, m.type) || m.date === item.date));
    if (!same) {
      merged.push(item);
      continue;
    }
    if (same.date === item.date || item.date === null) {
      same.weight ??= item.weight;
      same.time ??= item.time;
      continue;
    }
    if (same.date === null) {
      Object.assign(same, { date: item.date, time: item.time, dateText: item.dateText, dateConfidence: item.dateConfidence, confidence: item.confidence, issues: item.issues, source: item.source });
      continue;
    }
    same.issues = [
      ...same.issues,
      `Your syllabus gives more than one date: ${formatKey(same.date)} (line ${same.source.line}) and ${formatKey(item.date)} (line ${item.source.line}).`,
    ].slice(0, 6);
    same.confidence = "low";
    same.dateConfidence = "low";
  }

  // Weights from the grading breakdown, for the single items it names.
  for (const entry of grading) {
    const label = titleKey(entry.label);
    const labelType = assessmentType(entry.label);
    const exact = merged.find((m) => titleKey(m.title) === label);
    const match = exact ?? merged.find((m) => {
      const key = titleKey(m.title);
      // "Essay 1" names "Essay 1 (5 pages)", but not "Essay 1 proposal".
      if (/\d/.test(label) && key.startsWith(`${label} `) && /^\d/.test(key.slice(label.length + 1))) return true;
      if ((labelType === "midterm" || labelType === "final") && m.type === labelType && !/\d/.test(label) && !/\d/.test(key)) return true;
      return false;
    });
    if (match) {
      match.weight ??= entry.weight;
      continue;
    }
    // A midterm or final the grading section names, with no date anywhere: keep it, undated, for the student to place.
    if ((labelType === "midterm" || labelType === "final") && !/s$/i.test(entry.label.trim())) {
      merged.push({
        id: `a${assessments.length + merged.length + 1}`,
        key: identityKey(entry.label, labelType),
        order: merged.length,
        title: entry.label,
        type: labelType,
        date: null,
        time: null,
        dateText: null,
        dateConfidence: "low",
        weight: entry.weight,
        week: null,
        confidence: "low",
        issues: ["Your syllabus lists this in the grading breakdown but gives no date — add it when you know."],
        source: entry.source,
      });
    }
  }

  if (usedWeeksWithoutAnchor) {
    notes.push("Your syllabus counts weeks, but Rushd doesn't know when week 1 starts. Add the term start date in Course details, or set each date yourself.");
  }
  if (merged.length === 0 && topics.length === 0) {
    notes.push("Rushd couldn't find assessments or a schedule in this text. If it came from a scanned PDF, try copying the text and pasting it instead.");
  }

  return {
    method: "rules",
    course,
    assessments: merged.slice(0, 150).map((item, i) => {
      const { key, order, ...rest } = item;
      void key;
      void order;
      return { ...rest, id: `a${i + 1}` };
    }),
    topics: topics.slice(0, 150),
    objectives: objectives.slice(0, 60),
    grading: grading.slice(0, 30),
    notes,
  };
}
