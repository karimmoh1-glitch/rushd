"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearPinnedBlocks } from "@/server/actions/schedule";

/** Returning the plan to fully automatic is a major change, so it's
 * previewed (how many locked blocks) and confirmed first. */
export function ClearPinnedButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const r = await clearPinnedBlocks();
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(`Unlocked ${r.cleared ?? count} block${(r.cleared ?? count) === 1 ? "" : "s"}. Plan regenerated.`);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Regenerate from scratch
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate your whole plan?</DialogTitle>
            <DialogDescription>
              This unlocks the {count} block{count === 1 ? "" : "s"} you placed or locked, and Rushd re-places all of
              your work automatically. Your assignments, estimates, and availability don&apos;t change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep my blocks
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {pending ? "Regenerating..." : `Unlock ${count} and regenerate`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
