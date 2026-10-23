import * as z from "zod";

// How a student wants Rushd's AI to teach them, turned into a short text block
// for the prompts. The student's own words always sit below the system rules.

export const MAX_INSTRUCTIONS = 1000;

export const TutorPreferencesSchema = z.object({
  depth: z.enum(["brief", "balanced", "detailed"]).default("balanced"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  approach: z.enum(["hints_first", "worked_examples", "mixed"]).default("mixed"),
  difficulty: z.enum(["easier", "matched", "harder"]).default("matched"),
  tone: z.enum(["encouraging", "neutral", "direct"]).default("neutral"),
  diagnosticFirst: z.boolean().default(false),
  challengeMe: z.boolean().default(false),
});
export type TutorPreferences = z.infer<typeof TutorPreferencesSchema>;

export const DEFAULT_PREFERENCES: TutorPreferences = TutorPreferencesSchema.parse({});

export function readPreferences(value: unknown): TutorPreferences {
  const parsed = TutorPreferencesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

// The prompt line for each non-default choice, in the order they are sent.
const LINES: Record<string, Record<string, string>> = {
  depth: { brief: "Keep explanations to the essentials.", detailed: "Explain thoroughly, including the why behind each step." },
  length: { short: "Keep replies short (a few sentences or a short list).", long: "Longer replies are fine when they help." },
  approach: {
    hints_first: "Start with a hint or a guiding question; give the full solution only if they ask or stay stuck.",
    worked_examples: "Teach with fully worked examples, then let them try a similar one.",
  },
  difficulty: { easier: "Keep practice questions approachable.", harder: "Make practice questions harder when they answer correctly." },
  tone: { encouraging: "Be warm and encouraging.", direct: "Be direct; skip the pep talk." },
};

/** Removes anything that could pose as markup around the block. */
export function sanitizeInstructions(text: string): string {
  return text
    .replace(/<\/?[a-z_][^>]*>/gi, "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, MAX_INSTRUCTIONS);
}

/** The compact form sent to the model; null when everything is default. */
export function compactPreferences(prefs: TutorPreferences, instructions: string | null | undefined): string | null {
  const lines: string[] = [];
  const choices: Record<string, string> = {
    depth: prefs.depth,
    length: prefs.length,
    approach: prefs.approach,
    difficulty: prefs.difficulty,
    tone: prefs.tone,
  };
  for (const key of Object.keys(LINES)) {
    const line = LINES[key][choices[key]];
    if (line) lines.push(`- ${line}`);
  }
  if (prefs.diagnosticFirst) lines.push("- Before explaining a topic, ask one short diagnostic question to find where they are.");
  if (prefs.challengeMe) lines.push("- Don't just agree: point out flaws in their reasoning and push back when they're wrong.");
  const own = sanitizeInstructions(instructions ?? "");
  if (own) lines.push(`- In their own words: "${own.replace(/"/g, "'")}"`);
  if (lines.length === 0) return null;
  return lines.join("\n");
}
