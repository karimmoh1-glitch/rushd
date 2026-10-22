import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// One server-side client for conversational features. The key comes from the
// server environment only; nothing here is importable from client code.
let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 55_000, maxRetries: 1 });
  return client;
}
