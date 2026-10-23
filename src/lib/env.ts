import "server-only";
import * as z from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters"),
  ANTHROPIC_API_KEY: z.string().optional(),
  // 32 random bytes, base64 (see src/lib/canvas/token-vault.ts). Optional:
  // without it the Canvas integration reports itself as unavailable.
  CANVAS_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issueLines: string[] = [];
    for (const issue of parsed.error.issues) {
      issueLines.push(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    const issues = issueLines.join("\n");
    throw new Error(
      `Invalid environment configuration. Check .env against .env.example:\n${issues}`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();

export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
