"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPasswordResetLink } from "@/server/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetLinkForm() {
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setLink(null);
    startTransition(async () => {
      const result = await createPasswordResetLink({ email });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setLink(result.link);
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="reset-email" className="text-xs text-muted-foreground">
            Student email
          </label>
          <Input id="reset-email" name="email" type="email" required className="h-9 w-64" autoComplete="off" />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Creating…" : "Create reset link"}
        </Button>
      </form>
      {link && (
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">
            Works once, expires in 1 hour. Send it to the student directly; anyone with it can set their password.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={link} className="h-9 font-mono text-xs" aria-label="Reset link" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied."))}
            >
              Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
