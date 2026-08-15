import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, aiEnabled } from "@/lib/env";
import { QuickAddDraftSchema, ExtractedAssignmentListSchema } from "./schemas";
import type { AIProvider, ExtractedAssignment, ImageInput } from "./provider";
import type { ClassRef } from "./fallback-parse";

// Small, fast, cheap model for both tasks here — structured extraction,
// not a conversation. See docs/ARCHITECTURE.md: "AI is a supporting
// capability, not the product."
const MODEL = "claude-haiku-4-5-20251001";

const QUICK_ADD_TOOL: Anthropic.Tool = {
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

const EXTRACT_IMAGE_TOOL: Anthropic.Tool = {
  name: "extract_assignments",
  description:
    "Extract every assignment, exam, or quiz visible in a screenshot of a school calendar or assignment list.",
  input_schema: {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            kind: { type: "string", enum: ["assignment", "exam"] },
            classId: {
              type: ["string", "null"],
              description: "id from the provided class list if it clearly matches, else null.",
            },
            classNameGuess: {
              type: ["string", "null"],
              description: "The class/course name as it literally appears in the image, even if it didn't match a known class.",
            },
            dueAt: { type: ["string", "null"], description: "ISO 8601 UTC datetime, or null if unclear." },
            dueDateConfidence: { type: "string", enum: ["high", "medium", "low"] },
            estimatedMinutes: { type: "integer" },
            effortConfidence: { type: "string", enum: ["high", "medium", "low"] },
            notes: { type: ["string", "null"] },
          },
          required: [
            "title", "kind", "classId", "classNameGuess", "dueAt",
            "dueDateConfidence", "estimatedMinutes", "effortConfidence", "notes",
          ],
        },
      },
    },
    required: ["assignments"],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export const anthropicProvider: AIProvider = {
  async parseQuickAdd(text, classes, now) {
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
        tools: [QUICK_ADD_TOOL],
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
  },

  async parseAssignmentImages(
    images: ImageInput[],
    classes: ClassRef[],
    now: Date,
  ): Promise<ExtractedAssignment[] | null> {
    if (!aiEnabled) return null;
    if (images.length === 0) return [];

    try {
      const response = await getClient().messages.create({
        model: MODEL,
        max_tokens: 4000,
        system:
          `Today's date is ${now.toISOString()}. ` +
          `The student's known classes are: ${JSON.stringify(classes)}. ` +
          `These images are screenshots of a school assignment calendar or list (e.g. Canvas). ` +
          `Extract every assignment, exam, or quiz visible using the extract_assignments tool. ` +
          `Match each item to a known class by id when the class name in the image clearly corresponds ` +
          `to one in the list; otherwise leave classId null and put the literal text in classNameGuess. ` +
          `Mark dueDateConfidence and effortConfidence honestly — "low" is a normal, expected answer when ` +
          `the image is ambiguous, not a failure. Never invent a due date that isn't visible or clearly implied; ` +
          `use null and low confidence instead. If effort isn't stated, estimate from the assignment type ` +
          `(30 min for a worksheet, 90-120 for a lab or essay, etc.) and mark effortConfidence "low".`,
        tools: [EXTRACT_IMAGE_TOOL],
        tool_choice: { type: "tool", name: "extract_assignments" },
        messages: [
          {
            role: "user",
            content: images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType,
                data: img.base64,
              },
            })),
          },
        ],
      });

      const toolUse = response.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") return null;

      const parsed = ExtractedAssignmentListSchema.safeParse(toolUse.input);
      return parsed.success ? parsed.data.assignments : null;
    } catch (error) {
      console.error("[ai] image extraction failed, falling back to manual entry", error);
      return null;
    }
  },
};
