import * as z from "zod";

export const NewPasswordSchema = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(200, { error: "Use at most 200 characters." })
  .regex(/[a-zA-Z]/, { error: "Include at least one letter." })
  .regex(/[0-9]/, { error: "Include at least one number." });

export const SignupSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  password: NewPasswordSchema,
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(40)
    .nullish()
    // Treat an empty code the same as no code.
    .transform((code) => code || undefined),
});

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Enter your password." }),
});
