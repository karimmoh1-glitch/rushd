import { CATALOG } from "./index";
import { COURSE_LEVELS, relatedLevels, type CourseLevelValue } from "./levels";
import type { CatalogRecord } from "./types";

// Ranked course search over the catalog: title, aliases, subject, provider,
// code, and level. Every word typed must match something (exactly, as a
// prefix, or within a typo or two), so results stay few and relevant. Runs in
// the browser on every keystroke; the index is built once.

const STOP_WORDS = new Set(["and", "of", "the", "to", "in", "for", "a", "an", "with", "on"]);
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4" };

/** Lowercase, no accents or punctuation, "&" as "and". */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Search tokens: normalized words without stop words, roman numerals as digits. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of normalize(text).split(" ")) {
    if (!word || STOP_WORDS.has(word)) continue;
    out.push(ROMAN[word] ?? word);
  }
  return out;
}

/** Optimal string alignment distance (edits incl. swapping two neighbors), capped at max + 1. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, d[i - 2][j - 2] + 1);
      d[i][j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
  }
  return d[rows - 1][cols - 1];
}

/** Scores at or above this mean the word was typed right (exactly or as a prefix). */
const CLEAN = 0.8;

/** How well one typed word matches one indexed word: 1 exact, 0.8 prefix, about 0.5 for a typo, 0 no match. */
function wordScore(typed: string, word: string): number {
  if (typed === word) return 1;
  if (word.startsWith(typed)) return typed.length === 1 ? 0.4 : CLEAN;
  if (typed.length < 4) return 0;
  const max = typed.length >= 7 ? 2 : 1;
  const distance = editDistance(typed, word, max);
  if (distance <= max) return distance === 1 ? 0.55 : 0.45;
  // A typo in a word that isn't finished yet ("chemsit" for "chemistry").
  if (word.length > typed.length && editDistance(typed, word.slice(0, typed.length), max) <= max) return 0.4;
  return 0;
}

function bestWordScore(typed: string, words: readonly string[]): number {
  let best = 0;
  for (const word of words) {
    const score = wordScore(typed, word);
    if (score > best) best = score;
    if (best === 1) break;
  }
  return best;
}

interface Indexed {
  record: CatalogRecord;
  order: number;
  title: string;
  titleWords: string[];
  aliases: string[];
  aliasWords: string[];
  subjectWords: string[];
  extraWords: string[];
  levelWords: string[];
}

const LEVEL_WORDS = new Map<CourseLevelValue, string[]>(
  COURSE_LEVELS.map((option) => [option.value, [...new Set([option.label, ...option.terms].flatMap(tokenize))]]),
);

let INDEX: Indexed[] | null = null;

function index(): Indexed[] {
  if (INDEX) return INDEX;
  INDEX = CATALOG.map((record, order) => ({
    record,
    order,
    title: normalize(record.title),
    titleWords: tokenize(record.title),
    aliases: record.aliases.map(normalize),
    aliasWords: [...new Set(record.aliases.flatMap(tokenize))],
    subjectWords: tokenize(record.subject),
    extraWords: [record.provider, record.code, record.curriculumId].filter((value): value is string => Boolean(value)).flatMap(tokenize),
    levelWords: [...new Set(record.levels.flatMap((level) => LEVEL_WORDS.get(level) ?? []))],
  }));
  return INDEX;
}

const WEIGHT = { title: 40, alias: 34, extra: 16, level: 22, subject: 10 };

interface TextMatch {
  score: number;
  /** Every word typed right (no typo needed). */
  clean: boolean;
  /** The whole query is the title or an alias. */
  exact: boolean;
}

/** How one record matches the query, or null if any typed word matches nothing. */
function textScore(entry: Indexed, phrase: string, words: string[]): TextMatch | null {
  let total = 0;
  let clean = true;
  const titleHits = new Set<string>();
  for (const typed of words) {
    let best = 0;
    let bestRaw = 0;
    const consider = (weight: number, raw: number) => {
      if (weight * raw > best) {
        best = weight * raw;
        bestRaw = raw;
      }
    };
    for (const titleWord of entry.titleWords) {
      const raw = wordScore(typed, titleWord);
      if (raw >= CLEAN) titleHits.add(titleWord);
      consider(WEIGHT.title, raw);
    }
    consider(WEIGHT.alias, bestWordScore(typed, entry.aliasWords));
    consider(WEIGHT.extra, bestWordScore(typed, entry.extraWords));
    // Level words must be typed in full ("ap", "honors"), never guessed.
    consider(WEIGHT.level, entry.levelWords.includes(typed) ? 1 : 0);
    consider(WEIGHT.subject, bestWordScore(typed, entry.subjectWords));
    if (best === 0) return null;
    if (bestRaw < CLEAN) clean = false;
    total += best;
  }
  const exact = entry.title === phrase || entry.aliases.includes(phrase);
  if (entry.title === phrase) total += 60;
  else if (entry.aliases.includes(phrase)) total += 50;
  else if (entry.title.startsWith(phrase)) total += 25;
  else if (entry.aliases.some((alias) => alias.startsWith(phrase))) total += 20;
  // Prefer records whose title the query covers more of ("Chemistry" over "AP Chemistry").
  total += 25 * (titleHits.size / Math.max(1, entry.titleWords.length));
  return { score: total, clean, exact };
}

/** Which of a record's levels to show, given the student's level. */
export function displayLevel(record: CatalogRecord, prefer?: CourseLevelValue | null): CourseLevelValue {
  if (prefer && record.levels.includes(prefer)) return prefer;
  for (const level of relatedLevels(prefer)) {
    if (record.levels.includes(level)) return level;
  }
  return record.levels[0];
}

/**
 * How close a record is to the student's level: 10 = their own level, then one
 * step lower for each related level in order (a high school student sees
 * honors, then AP, then IB, then dual enrollment), 0 = unrelated. With no
 * level, everything ties at 1 and the text score decides.
 */
function levelTier(record: CatalogRecord, prefer: CourseLevelValue | null | undefined): number {
  if (!prefer || prefer === "OTHER") return 1;
  const related = relatedLevels(prefer);
  const rank = related.findIndex((level) => record.levels.includes(level));
  return rank < 0 ? 0 : 10 - rank;
}

/** True when the query is exactly the record's title or one of its aliases. */
export function isExactMatch(record: CatalogRecord, query: string): boolean {
  const phrase = normalize(query);
  return normalize(record.title) === phrase || record.aliases.some((alias) => normalize(alias) === phrase);
}

export interface SearchOptions {
  /** Only records offered at this level. */
  level?: CourseLevelValue | null;
  /** The student's own level: records at related levels rank first. */
  prefer?: CourseLevelValue | null;
  limit?: number;
}

export interface SearchHit {
  record: CatalogRecord;
  /** The level to label this result with. */
  level: CourseLevelValue;
  score: number;
}

export function searchCourses(query: string, options: SearchOptions = {}): SearchHit[] {
  const words = tokenize(query);
  const phrase = normalize(query);
  if (words.length === 0) return [];
  const { level, prefer, limit = 10 } = options;

  const hits: (SearchHit & { order: number; tier: number })[] = [];
  for (const entry of index()) {
    if (level && !entry.record.levels.includes(level)) continue;
    const match = textScore(entry, phrase, words);
    if (!match) continue;
    // Courses at the student's level come first, but only for words typed
    // right: a typo-only match never outranks a clean one. An exact name at
    // an unrelated level still beats loose matches.
    let tier = match.clean ? levelTier(entry.record, prefer) : 0;
    if (match.exact) tier = Math.max(tier, 1);
    hits.push({ record: entry.record, level: level ?? displayLevel(entry.record, prefer), score: match.score, order: entry.order, tier });
  }

  hits.sort((a, b) => b.tier - a.tier || b.score - a.score || a.record.title.length - b.record.title.length || a.order - b.order);
  return hits.slice(0, limit).map(({ record, level: shown, score }) => ({ record, level: shown, score }));
}

/** A spread of courses at one level (one per subject in turn), for browsing before typing. */
export function browseCourses(level: CourseLevelValue, limit = 8): CatalogRecord[] {
  const bySubject = new Map<string, CatalogRecord[]>();
  for (const record of CATALOG) {
    if (record.levels[0] !== level && !(record.levels.includes(level) && record.kind === "official")) continue;
    const list = bySubject.get(record.subject) ?? [];
    list.push(record);
    bySubject.set(record.subject, list);
  }
  // Levels whose records are all shared (e.g. dual enrollment) fall back to any record offered there.
  if (bySubject.size === 0) {
    for (const record of CATALOG) {
      if (!record.levels.includes(level)) continue;
      const list = bySubject.get(record.subject) ?? [];
      list.push(record);
      bySubject.set(record.subject, list);
    }
  }
  const lists = [...bySubject.values()];
  const out: CatalogRecord[] = [];
  for (let round = 0; out.length < limit; round++) {
    let added = false;
    for (const list of lists) {
      if (round < list.length && out.length < limit) {
        out.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Text score of free-text fields (a student's own course name, code, school) against a query; 0 = no match. */
export function scoreText(query: string, fields: (string | null | undefined)[]): number {
  const words = tokenize(query);
  if (words.length === 0) return 0;
  const fieldWords = fields.filter((field): field is string => Boolean(field)).flatMap(tokenize);
  let total = 0;
  for (const typed of words) {
    const best = bestWordScore(typed, fieldWords);
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export interface HitGroup {
  level: CourseLevelValue;
  hits: SearchHit[];
}

/** Hits grouped by the level they're labeled with, groups in order of their best hit. */
export function groupByLevel(hits: SearchHit[]): HitGroup[] {
  const groups: HitGroup[] = [];
  for (const hit of hits) {
    let group = groups.find((candidate) => candidate.level === hit.level);
    if (!group) {
      group = { level: hit.level, hits: [] };
      groups.push(group);
    }
    group.hits.push(hit);
  }
  return groups;
}
