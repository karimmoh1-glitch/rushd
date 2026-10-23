import "server-only";
import type { GeneratedQuestion, QuickAddDraft, SyllabusAiResult } from "./schemas";
import type { ClassRef } from "./fallback-parse";

export type Confidence = "high" | "medium" | "low";

export interface ExtractedAssignment {
  title: string;
  kind: "assignment" | "exam";
  /** Best-guess match against the classes passed in, or null if none. */
  classId: string | null;
  /** Raw class name text as it appeared in the image, shown even without a match. */
  classNameGuess: string | null;
  dueAt: string | null; // ISO
  dueDateConfidence: Confidence;
  estimatedMinutes: number;
  effortConfidence: Confidence;
  notes: string | null;
}

export interface ImageInput {
  /** Base64-encoded image bytes. Never written to disk. */
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
}

/** Provider-reported usage for one call, for cost metering (src/lib/ai/usage.ts). */
export interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** The token counts an Anthropic API response reports. */
interface ResponseWithUsage {
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}

/** Reads the usage numbers out of an Anthropic API response. */
export function readCallUsage(response: ResponseWithUsage): CallUsage {
  return {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

// Features call the AI through this interface, not the SDK, so a provider swap
// touches one file. Every method returns null on failure; callers have a fallback.
export interface AIProvider {
  parseQuickAdd(
    text: string,
    classes: ClassRef[],
    now: Date,
    onUsage?: (usage: CallUsage) => void,
  ): Promise<QuickAddDraft | null>;

  parseAssignmentImages(
    images: ImageInput[],
    classes: ClassRef[],
    now: Date,
    onUsage?: (usage: CallUsage) => void,
  ): Promise<ExtractedAssignment[] | null>;

  /** Practice questions for one topic, grounded in what the student's course
   * gives us. Null on any failure; callers keep the no-AI workflow. */
  generatePracticeQuestions(
    input: PracticeGenerationInput,
    onUsage?: (usage: CallUsage) => void,
  ): Promise<GeneratedQuestion[] | null>;

  /** Assessments, schedule, topics and objectives from the student's own
   * syllabus text, each with the line it came from. Null on any failure;
   * the rules-based parser is the fallback. */
  extractSyllabus(input: SyllabusExtractionInput, onUsage?: (usage: CallUsage) => void): Promise<SyllabusAiResult | null>;
}

export interface SyllabusExtractionInput {
  /** The syllabus text, already capped in length. */
  text: string;
  courseName: string;
  /** The course's term dates in Rushd (YYYY-MM-DD), if the student set them. */
  termStart: string | null;
  termEnd: string | null;
  /** Today in the student's calendar (YYYY-MM-DD). */
  today: string;
}

export interface PracticeGenerationInput {
  courseName: string;
  /** e.g. "AP", "University"; null when unknown. */
  level: string | null;
  topic: string;
  /** Other topics in the course, for context. */
  relatedTopics: string[];
  /** Short excerpts from the student's own course materials, if any matched. */
  excerpts: { title: string; text: string }[];
  /** Subject-family instruction (src/lib/learning/subjects.ts). */
  formatInstruction: string;
  count: number;
}
