"use server";

import * as z from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { issueResetToken, redeemResetToken } from "@/lib/auth/password-reset";
import { NewPasswordSchema } from "@/lib/validation/auth";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";

/** Admin-only: create a reset link to hand to a student who is locked out.
 * The token rides in the URL fragment, which browsers never send to a
 * server, so it can't land in access logs or Referer headers. */
export async function createPasswordResetLink(
  input: { email: string },
): Promise<{ link: string; expiresInMinutes: number } | { error: string }> {
  const admin = await requireUserOrThrow();
  if (!admin.isAdmin) return { error: "Not allowed." };
  const email = z.email().trim().toLowerCase().safeParse(input.email);
  if (!email.success) return { error: "Enter a valid email address." };

  const user = await db.user.findUnique({ where: { email: email.data }, select: { id: true } });
  if (!user) return { error: "No account uses that email." };

  const token = await issueResetToken(user.id);
  return { link: `${env.NEXT_PUBLIC_APP_URL}/reset-password#token=${token}`, expiresInMinutes: 60 };
}

export async function resetPassword(
  input: { token: string; password: string },
): Promise<{ success: true } | { error: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`reset:${ip}`);
  if (!rate.allowed) return { error: "Too many attempts. Try again in a few minutes." };

  const password = NewPasswordSchema.safeParse(input.password);
  if (!password.success) return { error: password.error.issues[0]?.message ?? "Choose a stronger password." };

  const outcome = await redeemResetToken(String(input.token ?? ""), password.data);
  if (!outcome.ok) {
    return {
      error:
        outcome.reason === "expired"
          ? "This link has expired. Ask for a new one."
          : "This link isn't valid anymore. It may have been used already.",
    };
  }
  return { success: true };
}

/** Self-serve reset by email. Same answer whether or not the account exists,
 * so it can't be used to discover who has an account. */
export async function requestPasswordReset(input: { email: string }): Promise<{ success: true } | { error: string }> {
  if (!emailConfigured()) return { error: "Reset emails aren't available yet." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const email = z.email().trim().toLowerCase().safeParse(input.email);
  if (!email.success) return { error: "Enter a valid email address." };
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`reset-request:${ip}`),
    checkRateLimit(`reset-request-email:${email.data}`, { max: 3, windowMs: 60 * 60 * 1000 }),
  ]);
  if (!byIp.allowed) return { error: "Too many attempts. Try again in a few minutes." };
  if (!byEmail.allowed) return { success: true };

  const user = await db.user.findUnique({ where: { email: email.data }, select: { id: true } });
  if (user) {
    const token = await issueResetToken(user.id);
    const mail = passwordResetEmail(`${env.NEXT_PUBLIC_APP_URL}/reset-password#token=${token}`);
    await sendEmail({ to: email.data, ...mail });
  }
  return { success: true };
}
