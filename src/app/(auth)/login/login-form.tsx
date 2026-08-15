"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    login,
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
        />
        {state?.errors?.email && (
          <p className="text-sm text-destructive">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.errors?.password ? true : undefined}
        />
        {state?.errors?.password && (
          <p className="text-sm text-destructive">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to Rushd?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
