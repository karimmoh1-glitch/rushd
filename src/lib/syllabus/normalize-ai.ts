import type { SyllabusAiResult } from "@/lib/ai/schemas";
import { dayOfWeekForKey } from "@/lib/time/zone";
import { dayName, findDateTokens, formatKey, resolveMonthDay, type YearContext } from "./dates";
import { normalizeSyllabusText, yearContextFor, type ParseOptions } from "./parse";
import type { Confidence, DraftCourse, DraftField, SourceRef, SyllabusDraft } from "./types";

// AI output is checked against the syllabus text before the student sees it.
// Each item's quoted source must actually be in the text: course details that
// can't be found are dropped (never invented), and other items that can't be
// found are kept only as flagged, excluded-by-default suggestions. Dates the
// AI gives are re-read from the quoted line with the same rules the parser
// uses, so a date the line doesn't support is shown as a conflict.

function squash(text: string): string {
  return text.toLowerCase().replace(/[\s ]+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

export function locate(lines: string[], quote: string): SourceRef {
  const needle = squash(quote);
  if (needle.length >= 3) {
    // Whole quote on one line, else the quote's start (it may run over a line break).
    for (const probe of [needle, needle.slice(0, 50)]) {
      if (probe.length < 3) continue;
      const index = lines.findIndex((line) => squash(line).includes(probe));
      if (index >= 0) return { line: index + 1, snippet: lines[index].trim().slice(0, 300) };
    }
  }
  return { line: null, snippet: quote.slice(0, 300) };
}

const NOT_FOUND = "Rushd couldn't find this in your syllabus text — check it before adding.";

function lower(a: Confidence, b: Confidence): Confidence {
  const order: Confidence[] = ["low", "medium", "high"];
  return order[Math.min(order.indexOf(a), order.indexOf(b))];
}

/** Dates the quoted line itself supports, read with the parser's rules. */
function datesInLine(line: string, ctx: YearContext): { date: string; confidence: Confidence; issues: string[] }[] {
  const out: { date: string; confidence: Confidence; issues: string[] }[] = [];
  for (const token of findDateTokens(line)) {
    const md = token.kind === "date" ? token.value : token.kind === "range" ? token.finish : null;
    if (!md) continue;
    const resolved = resolveMonthDay(md, ctx);
    if (resolved.date) out.push({ date: resolved.date, confidence: resolved.confidence, issues: resolved.issues });
  }
  return out;
}

export function normalizeAiDraft(ai: SyllabusAiResult, input: string, options: ParseOptions): SyllabusDraft {
  const text = normalizeSyllabusText(input);
  const lines = text.split("\n");
  const { ctx } = yearContextFor(text, options);
  const notes: string[] = [];

  const course: DraftCourse = { title: null, code: null, instructor: null, term: null, termStart: null, termEnd: null };
  for (const key of ["title", "code", "instructor", "term", "termStart", "termEnd"] as const) {
    const value = ai.course[key];
    if (!value) continue;
    const source = locate(lines, value.source);
    if (source.line === null) continue; // not in the text: never shown
    let field: DraftField = { value: value.value, confidence: "high", issues: [], source };
    if (key === "termStart" || key === "termEnd") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.value)) continue;
      const supported = datesInLine(source.snippet, ctx);
      const same = supported.find((d) => d.date === value.value);
      if (same) field = { ...field, confidence: same.confidence, issues: same.issues };
      else if (supported.length === 0) continue;
      else field = { ...field, confidence: "low", issues: [`The line says ${formatKey(supported[0].date, true)}.`] };
    } else if (!squash(text).includes(squash(value.value))) {
      // A course detail must appear in the syllabus as written.
      continue;
    }
    course[key] = field;
  }

  const assessments = ai.assessments.map((item, i) => {
    const source = locate(lines, item.source);
    const issues: string[] = [];
    let confidence: Confidence = item.confidence;
    let dateConfidence: Confidence = item.date ? item.confidence : "low";
    if (source.line === null) {
      issues.push(NOT_FOUND);
      confidence = "low";
    }
    if (item.date) {
      const supported = datesInLine(source.line ? source.snippet : item.source, ctx);
      const same = supported.find((d) => d.date === item.date);
      if (same) {
        dateConfidence = lower(dateConfidence, same.confidence);
        issues.push(...same.issues);
      } else if (supported.length > 0) {
        issues.push(`The line says ${formatKey(supported[0].date, true)}, not ${formatKey(item.date, true)}.`);
        dateConfidence = "low";
      } else {
        issues.push("The date isn't written on this line — Rushd inferred it from the schedule. Check it.");
        dateConfidence = lower(dateConfidence, "medium");
      }
    } else {
      issues.push(item.note ? item.note : "No date in your syllabus — add one, or leave it out.");
    }
    const weekday = findDateTokens(source.snippet).find((t) => t.kind === "weekday");
    if (item.date && weekday && weekday.kind === "weekday" && dayOfWeekForKey(item.date) !== weekday.dow) {
      issues.push(`Your syllabus says ${dayName(weekday.dow)}, but ${formatKey(item.date, true)} is a ${dayName(dayOfWeekForKey(item.date))}.`);
      dateConfidence = "low";
    }
    if (item.note && item.date && !issues.includes(item.note)) issues.push(item.note);
    confidence = lower(confidence, dateConfidence);
    if (issues.length > 0 && confidence === "high") confidence = "medium";
    return {
      id: `a${i + 1}`,
      title: item.title,
      type: item.type,
      date: item.date,
      time: item.time,
      dateText: item.dateText,
      dateConfidence,
      weight: item.weight !== null && source.line !== null && /%/.test(source.snippet) ? item.weight : null,
      week: null,
      confidence,
      issues: [...new Set(issues)].slice(0, 6),
      source,
    };
  });

  const topics = ai.topics.map((topic, i) => {
    const source = locate(lines, topic.source);
    return {
      id: `t${i + 1}`,
      title: topic.title,
      parentTitle: topic.parentTitle,
      week: topic.week,
      startDate: null,
      endDate: null,
      readings: null,
      confidence: source.line === null ? ("low" as const) : topic.confidence,
      issues: source.line === null ? [NOT_FOUND] : [],
      source,
    };
  });

  const objectives = ai.objectives
    .map((objective, i) => ({ id: `o${i + 1}`, text: objective.text, confidence: "high" as Confidence, source: locate(lines, objective.source) }))
    .map((o) => (o.source.line === null ? { ...o, confidence: "low" as const } : o));

  const grading = ai.grading
    .map((entry) => ({ label: entry.label, weight: entry.weight, source: locate(lines, entry.source) }))
    .filter((entry) => entry.source.line !== null);

  const unplaced = assessments.filter((a) => a.source.line === null).length + topics.filter((t) => t.source.line === null).length;
  if (unplaced > 0) notes.push(`${unplaced} suggestion${unplaced === 1 ? "" : "s"} couldn't be matched to a line of your syllabus. They're left out unless you include them.`);

  return {
    method: "ai",
    course,
    assessments: assessments.slice(0, 150),
    topics: topics.slice(0, 150),
    objectives: objectives.slice(0, 60),
    grading: grading.slice(0, 30),
    notes,
  };
}
