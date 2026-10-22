import * as z from "zod";

// Course content as Canvas returns it, and the pure transforms Rushd applies
// before storing it. Nothing here touches the network or the database.

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
export const MAX_BODY_CHARS = 40_000;

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

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Canvas HTML to readable plain text. The result is only ever rendered as
 * text (React escapes it) or handed to the model as data, so this needs to be
 * faithful, not a sanitizer: scripts, styles and markup are dropped, block
 * boundaries become line breaks, list items become "- " lines.
 */
export function htmlToText(html: string | null | undefined, maxChars = MAX_BODY_CHARS): string {
  if (!html) return "";
  const text = html
    .replace(/<(script|style|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|pre|section|article)>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  const cleaned = decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars).trimEnd()}…` : cleaned;
}

// --- Rubrics -------------------------------------------------------------------

const RatingSchema = z.object({
  id: z.string().max(100),
  description: z.string().max(500),
  longDescription: z.string().max(4000).default(""),
  points: z.number().finite().min(0).max(10_000),
});

export const RubricCriterionSchema = z.object({
  id: z.string().min(1).max(100),
  description: z.string().max(500),
  longDescription: z.string().max(8000).default(""),
  points: z.number().finite().min(0).max(10_000),
  ratings: z.array(RatingSchema).max(20),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

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

/**
 * Validates the `rubric` array Canvas attaches to an assignment. Returns null
 * when there is no usable rubric; Rushd never fills one in. Criteria Canvas
 * marks `ignore_for_scoring` are dropped, as are malformed entries.
 */
export function parseRubric(raw: unknown): RubricCriterion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RubricCriterion[] = [];
  for (const entry of raw.slice(0, 50)) {
    const parsed = RawCriterionSchema.safeParse(entry);
    if (!parsed.success || parsed.data.ignore_for_scoring) continue;
    const c = parsed.data;
    const criterion = RubricCriterionSchema.safeParse({
      id: String(c.id),
      description: htmlToText(c.description ?? "", 500) || "Untitled criterion",
      longDescription: htmlToText(c.long_description ?? "", 8000),
      points: c.points ?? 0,
      ratings: (c.ratings ?? []).slice(0, 20).map((r, i) => ({
        id: String(r.id ?? i),
        description: htmlToText(r.description ?? "", 500),
        longDescription: htmlToText(r.long_description ?? "", 4000),
        points: r.points ?? 0,
      })),
    });
    if (criterion.success) out.push(criterion.data);
  }
  return out.length > 0 ? out : null;
}

/** Reads a stored rubric back out of the database (Json column). */
export function readStoredRubric(value: unknown): RubricCriterion[] | null {
  const parsed = z.array(RubricCriterionSchema).safeParse(value);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

export function rubricTotal(rubric: RubricCriterion[]): number {
  return rubric.reduce((n, c) => n + c.points, 0);
}
