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
  const m = value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
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
  const [duration, setDuration] = useState(
    DURATIONS.includes(block.minutes) ? block.minutes : DURATIONS.reduce((a, b) => (Math.abs(b - block.minutes) < Math.abs(a - block.minutes) ? b : a)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const startMinute = fromTimeValue(time);
    if (startMinute === null) {
      setError("Choose a start time.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await pinBlock({
        kind: block.kind,
        itemId: block.itemId,
        date,
        startMinute,
        durationMinutes: duration,
        blockId: block.pinned ? block.blockId : undefined,
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      toast.success("Block placed. Rushd will plan around it.");
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
              <Select value={date} onValueChange={(v) => v && setDate(v)}>
                <SelectTrigger id="block-day" className="w-full">
                  <SelectValue>{(v: string) => dayOptions.find((d) => d.date === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((d) => (
                    <SelectItem key={d.date} value={d.date}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-time">Starts</Label>
              <Input id="block-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="w-full" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-length">Length</Label>
              <Select value={String(duration)} onValueChange={(v) => v && setDuration(Number(v))}>
                <SelectTrigger id="block-length" className="w-full">
                  <SelectValue>{(v: string) => formatDuration(Number(v))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {formatDuration(d)}
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
