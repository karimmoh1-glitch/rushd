"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startCheckout } from "@/server/actions/billing";

export function CheckoutButton({ plan }: { plan: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startCheckout(plan);
          if (result && "error" in result) toast.error(result.error);
        })
      }
    >
      {pending ? "Opening checkout…" : "Continue to payment"}
    </Button>
  );
}
