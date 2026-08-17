"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { createInviteCode } from "@/server/actions/invite-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InviteCodeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const label = formData.get("label") as string;
    const maxUsesRaw = formData.get("maxUses") as string;

    startTransition(async () => {
      const result = await createInviteCode({
        label: label || undefined,
        maxUses: maxUsesRaw ? Number(maxUsesRaw) : undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite code created.");
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor="label" className="text-xs text-muted-foreground">
          Label (optional)
        </label>
        <Input id="label" name="label" placeholder="e.g. Lincoln High pilot" className="h-9 w-48" />
      </div>
      <div className="space-y-1">
        <label htmlFor="maxUses" className="text-xs text-muted-foreground">
          Max uses (optional)
        </label>
        <Input
          id="maxUses"
          name="maxUses"
          type="number"
          min={1}
          max={1000}
          placeholder="Unlimited"
          className="h-9 w-32"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creating…" : "Generate code"}
      </Button>
    </form>
  );
}
