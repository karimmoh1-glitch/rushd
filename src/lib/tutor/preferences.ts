import * as z from "zod";

// How a student wants Rushd's AI to teach them. Stored on Profile; turned
// into a short block of text for the tutor and feedback prompts. The free-form
// instructions are the student's own words and always sit below the system
// rules, never above them.

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

const LINES: { [K in keyof TutorPreferences]?: Partial<Record<string, string>> } = {
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
  for (const key of Object.keys(LINES) as (keyof TutorPreferences)[]) {
    const line = LINES[key]?.[String(prefs[key])];
    if (line) lines.push(`- ${line}`);
  }
  if (prefs.diagnosticFirst) lines.push("- Before explaining a topic, ask one short diagnostic question to find where they are.");
  if (prefs.challengeMe) lines.push("- Don't just agree: point out flaws in their reasoning and push back when they're wrong.");
  const own = sanitizeInstructions(instructions ?? "");
  if (own) lines.push(`- In their own words: "${own.replace(/"/g, "'")}"`);
  return lines.length ? lines.join("\n") : null;
}
