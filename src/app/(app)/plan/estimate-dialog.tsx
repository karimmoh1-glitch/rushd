"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEstimate } from "@/server/actions/plan-overrides";
import type { AgendaBlock } from "./types";

/** Changes the student's own estimate for the work behind a block. The plan
 * re-flows around it, and Rushd says if that leaves a deadline short. */
export function EstimateDialog({
  block,
  open,
  onOpenChange,
}: {
  block: AgendaBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [minutes, setMinutes] = useState(String(block.estimateMinutes));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isExam = block.kind === "exam";

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isInteger(value)) {
      setError("Enter whole minutes.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await changeEstimate({ kind: block.kind, itemId: block.itemId, minutes: value });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.risk) toast.warning(result.risk);
      else toast.success("Estimate saved. Your plan has been updated.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>{isExam ? "Change prep time" : "Change estimate"}</DialogTitle>
            <DialogDescription>
              {block.title}. {isExam ? "Your own number for total prep; Rushd still adjusts it by how your topics stand." : "How long the whole assignment will take you."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="estimate-minutes">{isExam ? "Prep time (minutes)" : "Estimate (minutes)"}</Label>
            <Input
              id="estimate-minutes"
              type="number"
              inputMode="numeric"
              min={isExam ? 15 : 5}
              max={3000}
              step={5}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save estimate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
