import type Anthropic from "@anthropic-ai/sdk";
import type { TutorClient } from "@/lib/tutor/agent";

// A scripted tutor model for tests: each call returns the next canned
// message (or throws). No live model is ever called.

export type ScriptStep = (req: Anthropic.Beta.MessageCreateParams) => Partial<Anthropic.Beta.BetaMessage>;

export function scriptedTutor(steps: ScriptStep[]) {
  const requests: Anthropic.Beta.MessageCreateParams[] = [];
  const client = {
    beta: {
      messages: {
        stream(req: Anthropic.Beta.MessageCreateParams) {
          requests.push(structuredClone(req));
          const step = steps[requests.length - 1];
          if (!step) throw new Error("scripted model ran out of steps");
          const message = { model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 }, ...step(req) } as Anthropic.Beta.BetaMessage;
          const handlers: ((t: string) => void)[] = [];
          return {
            on(event: string, fn: (t: string) => void) {
              if (event === "text") handlers.push(fn);
              return this;
            },
            async finalMessage() {
              for (const b of message.content) if (b.type === "text") handlers.forEach((h) => h(b.text));
              return message;
            },
          };
        },
      },
    },
  } as unknown as TutorClient;
  return { client, requests };
}

export function toolCall(name: string, input: Record<string, unknown>, id = `call_${name}_${Math.random().toString(36).slice(2, 8)}`): ScriptStep {
  return () => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input } as Anthropic.Beta.BetaToolUseBlock] });
}

export function reply(text: string): ScriptStep {
  return () => ({ stop_reason: "end_turn", content: [{ type: "text", text, citations: null } as Anthropic.Beta.BetaTextBlock] });
}

/** The tool_result the model got back for the last tool call before request `index`. */
export function lastToolResult(requests: Anthropic.Beta.MessageCreateParams[], index: number): { content: string; isError: boolean } {
  const blocks = requests[index].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
  const block = blocks[blocks.length - 1];
  return { content: String(block.content), isError: Boolean(block.is_error) };
}
