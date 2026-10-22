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
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <p role="status" className="rounded-lg border border-border bg-secondary/60 px-3 py-3">
        If an account uses that email, a reset link is on its way. It works once and expires in an hour. Check spam if it
        doesn&apos;t show up in a few minutes.
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await requestPasswordReset({ email });
          if ("error" in r) setError(r.error);
          else setSent(true);
        });
      }}
    >
      <Label htmlFor="forgot-email">Email</Label>
      <Input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending || !email.trim()}>
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
