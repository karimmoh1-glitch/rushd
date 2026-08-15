import "server-only";
import { anthropicProvider } from "./anthropic-provider";
import type { AIProvider } from "./provider";

/** The active AIProvider. Swapping providers means changing this one line
 * (and adding the new implementation file) — see docs/AI_ARCHITECTURE.md. */
export const aiProvider: AIProvider = anthropicProvider;

export type { AIProvider, ExtractedAssignment, ImageInput, Confidence } from "./provider";
