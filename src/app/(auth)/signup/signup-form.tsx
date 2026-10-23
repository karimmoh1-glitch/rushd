"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signup,
    undefined,
  );
  const [showInviteCode, setShowInviteCode] = useState(false);
  // Always show the invite field if the server complained about the code.
  const showInviteField = showInviteCode || Boolean(state?.errors?.inviteCode);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 sm:h-10"
          required
          aria-invalid={state?.errors?.email ? true : undefined}
          aria-describedby={state?.errors?.email ? "email-error" : undefined}
        />
        {state?.errors?.email && (
          <p id="email-error" className="text-sm text-destructive">
            {state.errors.email[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          className="h-11 sm:h-10"
          autoComplete="new-password"
          required
          aria-invalid={state?.errors?.password ? true : undefined}
          aria-describedby={
            state?.errors?.password ? "password-error" : undefined
          }
        />
        {state?.errors?.password ? (
          <ul id="password-error" className="space-y-0.5 text-sm text-destructive">
            {state.errors.password.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            At least 8 characters, with a letter and a number.
          </p>
        )}
      </div>

      {showInviteField ? (
        <div className="space-y-2">
          <Label htmlFor="inviteCode">Invite code</Label>
          <Input
            id="inviteCode"
            name="inviteCode"
            type="text"
            autoCapitalize="characters"
            aria-invalid={state?.errors?.inviteCode ? true : undefined}
            aria-describedby={state?.errors?.inviteCode ? "invite-code-error" : undefined}
          />
          {state?.errors?.inviteCode && (
            <p id="invite-code-error" className="text-sm text-destructive">
              {state.errors.inviteCode[0]}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInviteCode(true)}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Have an invite code?
        </button>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="ageConfirmed" required className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
        <span className="text-muted-foreground">
          I&apos;m 13 or older and agree to the{" "}
          <Link href="/terms" className="text-foreground underline underline-offset-4">Terms</Link> and{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-4">Privacy Policy</Link>.
        </span>
      </label>

      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" className="h-11 w-full sm:h-10" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
