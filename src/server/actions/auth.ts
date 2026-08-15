"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { SignupSchema, LoginSchema } from "@/lib/validation/auth";
import { logEvent } from "@/lib/analytics/log-event";

export type AuthFormState =
  | {
      errors?: { email?: string[]; password?: string[] };
      message?: string;
    }
  | undefined;

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rate = checkRateLimit(`signup:${await clientKey()}`);
  if (!rate.allowed) {
    return { message: "Too many attempts. Try again in a few minutes." };
  }

  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { email, password } = parsed.data;

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return {
      errors: {
        email: ["An account with this email already exists. Try logging in instead."],
      },
    };
  }

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: { email, passwordHash },
    select: { id: true },
  });

  await createSession(user.id);
  await logEvent(user.id, "signup");

  redirect("/onboarding");
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { email, password } = parsed.data;

  const rate = checkRateLimit(`login:${await clientKey()}:${email}`);
  if (!rate.allowed) {
    return { message: "Too many attempts. Try again in a few minutes." };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, onboardingCompletedAt: true },
  });

  // Same generic message whether the email doesn't exist or the password is
  // wrong — do not let this endpoint reveal which emails have accounts.
  const invalidMessage = { message: "Invalid email or password." };

  if (!user) return invalidMessage;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return invalidMessage;

  await createSession(user.id);

  redirect(user.onboardingCompletedAt ? "/dashboard" : "/onboarding");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
