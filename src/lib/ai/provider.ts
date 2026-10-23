import "server-only";
import type { QuickAddDraft } from "./schemas";
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
}
