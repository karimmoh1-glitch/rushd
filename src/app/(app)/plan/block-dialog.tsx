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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pinBlock } from "@/server/actions/schedule";
import { formatDuration } from "@/lib/format";
import type { AgendaBlock, DayOption } from "./types";

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

function toTimeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function fromTimeValue(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The length option nearest to the block's current length (the first one wins a tie). */
function closestDuration(minutes: number): number {
  let closest = DURATIONS[0];
  for (const option of DURATIONS) {
    if (Math.abs(option - minutes) < Math.abs(closest - minutes)) {
      closest = option;
    }
  }
  return closest;
}

/** Move and/or resize a block. Saving pins it: the planner will keep it
 * exactly here and plan everything else around it. */
export function BlockDialog({
  block,
  dayOptions,
  open,
  onOpenChange,
}: {
  block: AgendaBlock;
  dayOptions: DayOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState(block.date);
  const [time, setTime] = useState(toTimeValue(block.startMinute));
  const [duration, setDuration] = useState(closestDuration(block.minutes));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const startMinute = fromTimeValue(time);
    if (startMinute === null) {
      setError("Choose a start time.");
      return;
    }
    setError(null);
    if (block.kind === "review") return; // review blocks can't be pinned (the menu doesn't offer it)
    const kind = block.kind;
    startTransition(async () => {
      const result = await pinBlock({
        kind,
        itemId: block.itemId,
        date,
        startMinute,
        durationMinutes: duration,
        blockId: block.pinned ? block.blockId : undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.risk) toast.warning(result.risk);
      else toast.success("Block placed. Rushd will plan around it.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Move or resize</DialogTitle>
            <DialogDescription>
              {block.title}. Saving locks this block in place; the rest of your plan rearranges around it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="block-day">Day</Label>
              <Select value={date} onValueChange={(value) => value && setDate(value)}>
                <SelectTrigger id="block-day" className="w-full">
                  <SelectValue>{(value: string) => dayOptions.find((option) => option.date === value)?.label ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((option) => (
                    <SelectItem key={option.date} value={option.date}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-time">Starts</Label>
              <Input id="block-time" type="time" step={300} value={time} onChange={(event) => setTime(event.target.value)} className="w-full" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-length">Length</Label>
              <Select value={String(duration)} onValueChange={(value) => value && setDuration(Number(value))}>
                <SelectTrigger id="block-length" className="w-full">
                  <SelectValue>{(value: string) => formatDuration(Number(value))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {formatDuration(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {pending ? "Saving..." : "Save and lock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
