"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openBillingPortal } from "@/server/actions/billing";

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openBillingPortal();
          if (result && "error" in result) toast.error(result.error);
        })
      }
    >
      {pending ? "Opening…" : "Manage billing"}
    </Button>
  );
}
