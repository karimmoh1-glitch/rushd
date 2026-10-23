import "server-only";
import { anthropicProvider } from "./anthropic-provider";
import type { AIProvider } from "./provider";

// The active AI provider. To switch providers, add a new implementation and change this line.
export const aiProvider: AIProvider = anthropicProvider;

export type { AIProvider, CallUsage, ExtractedAssignment, ImageInput, Confidence } from "./provider";
