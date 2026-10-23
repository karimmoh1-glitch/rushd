import * as z from "zod";

// Course content as Canvas returns it, and the cleanup Rushd does before
// storing it. No network or database here.

export interface CanvasModuleItem {
  id: number;
  module_id?: number;
  position?: number;
  title: string;
  indent?: number;
  type: string; // File | Page | Discussion | Assignment | Quiz | SubHeader | ExternalUrl | ExternalTool
  content_id?: number;
  html_url?: string;
  page_url?: string;
  external_url?: string;
}

export interface CanvasModule {
  id: number;
  name: string;
  position?: number;
  items_count?: number;
  items?: CanvasModuleItem[];
}

export interface CanvasPage {
  page_id?: number;
  url: string;
  title: string;
  body?: string | null;
  html_url?: string;
  updated_at?: string;
  published?: boolean;
  locked_for_user?: boolean;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message?: string | null;
  posted_at?: string | null;
  html_url?: string;
  context_code?: string;
}

/** Longest plain text Rushd keeps per item; enough for long course pages. */
const MAX_BODY_CHARS = 40_000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

/** Turns one HTML entity (the part between & and ;) into its character. */
function decodeEntity(match: string, code: string): string {
  if (code[0] === "#") {
    let codePoint: number;
    if (code[1] === "x" || code[1] === "X") {
      codePoint = parseInt(code.slice(2), 16);
    } else {
      codePoint = parseInt(code.slice(1), 10);
    }
    const isValid = Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff;
    return isValid ? String.fromCodePoint(codePoint) : "";
  }
  return ENTITIES[code.toLowerCase()] ?? match;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity);
}

/**
 * Turns Canvas HTML into readable plain text. The result is only shown as text
 * (React escapes it) or given to the AI as data, so this doesn't need to be a
 * sanitizer, just faithful.
 */
export function htmlToText(html: string | null | undefined, maxChars = MAX_BODY_CHARS): string {
  if (!html) {
    return "";
  }

  let text = html;
  text = text.replace(/<(script|style|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1\s*>/gi, " "); // drop scripts, styles, etc.
  text = text.replace(/<!--[\s\S]*?-->/g, " "); // drop comments
  text = text.replace(/<li[^>]*>/gi, "\n- "); // list items become "- " lines
  text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|pre|section|article)>/gi, "\n"); // end of a block
  text = text.replace(/<(td|th)[^>]*>/gi, " ");
  text = text.replace(/<[^>]+>/g, ""); // remove all other tags

  text = decodeEntities(text);
  text = text.replace(/[ \t\f\v ]+/g, " "); // collapse spaces
  text = text.replace(/ *\n */g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  if (text.length > maxChars) {
    return `${text.slice(0, maxChars).trimEnd()}…`;
  }
  return text;
}

// --- Rubrics -------------------------------------------------------------------

const RatingSchema = z.object({
  id: z.string().max(100),
  description: z.string().max(500),
  longDescription: z.string().max(4000).default(""),
  points: z.number().finite().min(0).max(10_000),
});

const RubricCriterionSchema = z.object({
  id: z.string().min(1).max(100),
  description: z.string().max(500),
  longDescription: z.string().max(8000).default(""),
  points: z.number().finite().min(0).max(10_000),
  ratings: z.array(RatingSchema).max(20),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

/** The rubric shape Canvas sends (loosely checked). */
const RawCriterionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  description: z.string().nullish(),
  long_description: z.string().nullish(),
  points: z.number().nullish(),
  ignore_for_scoring: z.boolean().nullish(),
  ratings: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).nullish(),
        description: z.string().nullish(),
        long_description: z.string().nullish(),
        points: z.number().nullish(),
      }),
    )
    .nullish(),
});
type RawCriterion = z.infer<typeof RawCriterionSchema>;

/** Converts one Canvas rubric criterion into Rushd's shape (not yet validated). */
function toCriterion(raw: RawCriterion) {
  const rawRatings = (raw.ratings ?? []).slice(0, 20);
  const ratings = [];
  for (let i = 0; i < rawRatings.length; i++) {
    const rating = rawRatings[i];
    ratings.push({
      id: String(rating.id ?? i),
      description: htmlToText(rating.description ?? "", 500),
      longDescription: htmlToText(rating.long_description ?? "", 4000),
      points: rating.points ?? 0,
    });
  }

  return {
    id: String(raw.id),
    description: htmlToText(raw.description ?? "", 500) || "Untitled criterion",
    longDescription: htmlToText(raw.long_description ?? "", 8000),
    points: raw.points ?? 0,
    ratings,
  };
}

/**
 * Checks the `rubric` list Canvas attaches to an assignment. Returns null when
 * there's no usable rubric (Rushd never makes one up). Criteria marked
 * `ignore_for_scoring` and broken entries are dropped.
 */
export function parseRubric(raw: unknown): RubricCriterion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const criteria: RubricCriterion[] = [];
  for (const entry of raw.slice(0, 50)) {
    const parsedRaw = RawCriterionSchema.safeParse(entry);
    if (!parsedRaw.success || parsedRaw.data.ignore_for_scoring) {
      continue;
    }
    const criterion = RubricCriterionSchema.safeParse(toCriterion(parsedRaw.data));
    if (criterion.success) {
      criteria.push(criterion.data);
    }
  }

  return criteria.length > 0 ? criteria : null;
}

/** Reads a rubric back out of the database (Json column). */
export function readStoredRubric(value: unknown): RubricCriterion[] | null {
  const parsed = z.array(RubricCriterionSchema).safeParse(value);
  if (parsed.success && parsed.data.length > 0) {
    return parsed.data;
  }
  return null;
}

export function rubricTotal(rubric: RubricCriterion[]): number {
  let total = 0;
  for (const criterion of rubric) {
    total += criterion.points;
  }
  return total;
}
