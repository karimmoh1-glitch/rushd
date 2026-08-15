"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signup,
    undefined,
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
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
        <Input
          id="password"
          name="password"
          type="password"
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

      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
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
