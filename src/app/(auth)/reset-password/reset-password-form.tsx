"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "@/server/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The token lives in the URL fragment so it never reaches a server log.
function readToken(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export function ResetPasswordForm() {
  const token = useSyncExternalStore(
    () => () => {},
    readToken,
    () => "",
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Your password is updated.
        </p>
        <Link href="/login" className="text-sm font-medium underline underline-offset-4">
          Log in
        </Link>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetPassword({ token, password });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Drop the spent token from the address bar and history.
      history.replaceState(null, "", window.location.pathname);
      setDone(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!token && (
        <p className="text-sm text-muted-foreground">
          Open the full reset link you were given; this page needs the part after the #.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending || !token}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
