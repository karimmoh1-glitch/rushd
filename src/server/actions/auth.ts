"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { LOGIN_ACCOUNT_LIMIT, verifyCredentials } from "@/lib/auth/credentials";
import { createSession, deleteSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { SignupSchema, LoginSchema } from "@/lib/validation/auth";
import { logEvent } from "@/lib/analytics/log-event";
import { attachReferral, REF_COOKIE } from "@/lib/referral/referral";
import { getClientIp } from "@/server/actions/client-ip";

export type AuthFormState =
  | {
      errors?: { email?: string[]; password?: string[]; inviteCode?: string[] };
      message?: string;
    }
  | undefined;

// Extra details for the "signup" event, or undefined when there are none.
function signupEventDetails(inviteCode: string | undefined, referred: boolean) {
  if (!inviteCode && !referred) {
    return undefined;
  }
  const details: { inviteCode?: string; referred?: boolean } = {};
  if (inviteCode) {
    details.inviteCode = inviteCode;
  }
  if (referred) {
    details.referred = true;
  }
  return details;
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rate = await checkRateLimit(`signup:${await getClientIp()}`);
  if (!rate.allowed) {
    return { message: "Too many attempts. Try again in a few minutes." };
  }

  if (formData.get("ageConfirmed") !== "on") {
    return { message: "Please confirm you're 13 or older and agree to the Terms and Privacy Policy." };
  }

  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    inviteCode: formData.get("inviteCode"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { email, password, inviteCode } = parsed.data;

  // An invite code is always recorded when given, but only required when
  // REQUIRE_INVITE_CODE is set (see .env.example).
  let invite: { id: string; maxUses: number | null; _count: { users: number } } | null = null;
  if (inviteCode) {
    invite = await db.inviteCode.findUnique({
      where: { code: inviteCode },
      select: { id: true, maxUses: true, _count: { select: { users: true } } },
    });
    if (!invite) {
      return { errors: { inviteCode: ["That invite code isn't valid."] } };
    }
    if (invite.maxUses !== null && invite._count.users >= invite.maxUses) {
      return { errors: { inviteCode: ["That invite code has reached its limit."] } };
    }
  } else if (process.env.REQUIRE_INVITE_CODE) {
    return { errors: { inviteCode: ["An invite code is required to sign up right now."] } };
  }

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
    data: { email, passwordHash, invitedByCodeId: invite?.id },
    select: { id: true },
  });

  const jar = await cookies();
  const refCode = jar.get(REF_COOKIE)?.value;
  if (refCode) {
    await attachReferral(user.id, refCode);
    jar.delete(REF_COOKIE);
  }

  await createSession(user.id);
  await logEvent(user.id, "signup", signupEventDetails(invite ? inviteCode : undefined, Boolean(refCode)));

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

  // Per address+account (normal typos), and per account from anywhere, so a
  // botnet spread over many addresses still gets few guesses at one password.
  // Applies to emails without an account too, so it reveals nothing.
  const [rate, accountRate] = await Promise.all([
    checkRateLimit(`login:${await getClientIp()}:${email}`),
    checkRateLimit(`login-account:${email}`, LOGIN_ACCOUNT_LIMIT),
  ]);
  if (!rate.allowed || !accountRate.allowed) {
    return { message: "Too many attempts. Try again in a few minutes." };
  }

  // Same generic message whether the email doesn't exist or the password is
  // wrong — do not let this endpoint reveal which emails have accounts.
  // verifyCredentials also equalizes the bcrypt time of both paths.
  const user = await verifyCredentials(email, password);
  if (!user) return { message: "Invalid email or password." };

  await createSession(user.id, user.sessionVersion);

  redirect(user.onboardingCompletedAt ? "/dashboard" : "/onboarding");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
