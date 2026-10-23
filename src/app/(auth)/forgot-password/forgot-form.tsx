"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/server/actions/password-reset";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset({ email });
      if ("error" in result) {
        setError(result.error);
      } else {
        setSent(true);
      }
    });
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg border border-border bg-secondary/60 px-3 py-3">
        If an account uses that email, a reset link is on its way. It works once and expires in an hour. Check spam if it
        doesn&apos;t show up in a few minutes.
      </p>
    );
  }
  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Label htmlFor="forgot-email">Email</Label>
      <Input id="forgot-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="h-11 sm:h-10" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full sm:h-10" disabled={pending || !email.trim()}>
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
