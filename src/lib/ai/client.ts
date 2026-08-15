import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, aiEnabled } from "@/lib/env";
import { QuickAddDraftSchema, type QuickAddDraft } from "./schemas";
import type { ClassRef } from "./fallback-parse";

// Small, fast, cheap model — this is a short structured-extraction task,
// not a conversation. See docs/ARCHITECTURE.md: "AI is a supporting
// capability, not the product."
const MODEL = "claude-haiku-4-5-20251001";

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_quick_add",
  description:
    "Extract a structured assignment or exam from a student's free-text description.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["assignment", "exam"] },
      title: { type: "string", description: "Short title, no dates or durations in it." },
      classId: {
        type: ["string", "null"],
        description: "The id of the matching class from the provided list, or null if none clearly matches.",
      },
      dueAt: {
        type: ["string", "null"],
        description: "ISO 8601 UTC datetime, or null if no date could be determined.",
      },
      minutes: { type: "integer", description: "Estimated effort/prep time in minutes." },
      priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    },
    required: ["kind", "title", "classId", "dueAt", "minutes", "priority"],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Attempts to parse quick-add text with AI. Returns null on any failure —
 * missing key, network error, malformed response, or output that fails
 * schema validation — so the caller always falls back to the deterministic
 * parser (src/lib/ai/fallback-parse.ts) rather than surfacing an error or
 * crashing. AI output is never trusted directly; it goes through the exact
 * same QuickAddDraftSchema as the fallback parser's output.
 */
export async function parseWithAI(
  text: string,
  classes: ClassRef[],
  now: Date,
): Promise<QuickAddDraft | null> {
  if (!aiEnabled) return null;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        `Today's date is ${now.toISOString()}. ` +
        `The student's classes are: ${JSON.stringify(classes)}. ` +
        `Extract a single assignment or exam from the student's text using the extract_quick_add tool. ` +
        `If effort/time isn't mentioned, use 30 minutes for assignments or 120 for exams. ` +
        `If no priority is implied, use MEDIUM. Only set classId to a value from the provided list.`,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_quick_add" },
      messages: [{ role: "user", content: text }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    const parsed = QuickAddDraftSchema.safeParse(toolUse.input);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error("[ai] quick-add parse failed, falling back", error);
    return null;
  }
}
