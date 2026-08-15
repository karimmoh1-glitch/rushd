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
  /** Base64-encoded image bytes — never written to disk, see docs/AI_ARCHITECTURE.md. */
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
}

/**
 * Every AI-backed feature calls through this interface rather than an SDK
 * directly, so a provider swap later touches one file
 * (src/lib/ai/anthropic-provider.ts), not every call site. Every method
 * returns null on any failure — the caller always has a deterministic
 * fallback path. See docs/AI_ARCHITECTURE.md.
 */
export interface AIProvider {
  parseQuickAdd(
    text: string,
    classes: ClassRef[],
    now: Date,
  ): Promise<QuickAddDraft | null>;

  parseAssignmentImages(
    images: ImageInput[],
    classes: ClassRef[],
    now: Date,
  ): Promise<ExtractedAssignment[] | null>;
}
