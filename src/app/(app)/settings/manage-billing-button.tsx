"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openBillingPortal } from "@/server/actions/billing";

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await openBillingPortal();
      if (result && "error" in result) toast.error(result.error);
    });
  }

  return (
    <Button variant="outline" disabled={pending} onClick={handleClick}>
      {pending ? "Opening…" : "Manage billing"}
    </Button>
  );
}
