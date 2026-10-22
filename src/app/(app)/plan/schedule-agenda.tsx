"use client";

import { useState, useTransition } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock, LockOpen, MoreHorizontal, MoveRight, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pinBlock, unpinBlock } from "@/server/actions/schedule";
import { setAssignmentStatus } from "@/server/actions/assignments";
import { REASON_LABELS } from "@/lib/planning/constants";
import { formatDuration } from "@/lib/format";
import { formatMinuteOfDay } from "@/lib/time/zone";
import { cn } from "@/lib/utils";
import { BlockDialog } from "./block-dialog";
import type { AgendaBlock, AgendaDay, DayOption } from "./types";

function DayMeter({ planned, available }: { planned: number; available: number }) {
  const total = Math.max(planned, available);
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((planned / total) * 100));
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className={cn("h-full rounded-full", pct >= 90 ? "bg-warning" : "bg-brand")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BlockRow({ block, dayOptions }: { block: AgendaBlock; dayOptions: DayOption[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function lock() {
    startTransition(async () => {
      const r = await pinBlock({
        kind: block.kind,
        itemId: block.itemId,
        date: block.date,
        startMinute: block.startMinute,
        durationMinutes: Math.max(15, block.minutes),
      });
      if ("error" in r) toast.error(r.error);
      else toast.success("Locked. This block stays put when your plan changes.");
    });
  }
  function unlock() {
    if (!block.blockId) return;
    startTransition(async () => {
      const r = await unpinBlock(block.blockId!);
      if ("error" in r) toast.error(r.error);
      else toast.success("Unlocked. Rushd will place this automatically again.");
    });
  }
  function complete() {
    startTransition(async () => {
      const r = await setAssignmentStatus(block.itemId, "COMPLETED");
      if ("error" in r) toast.error(r.error);
      else {
        setDone(true);
        toast.success("Done. Your plan just got lighter.");
      }
    });
  }

  return (
    <li
      className={cn(
        "group flex items-stretch gap-3 rounded-lg border bg-card px-3 py-2.5 transition-[opacity,background-color] sm:gap-4",
        block.pinned ? "border-primary/40" : "border-border",
        (pending || done) && "opacity-60",
      )}
    >
      <div className="w-[4.75rem] shrink-0 font-mono text-xs leading-5 tabular-nums">
        <span className="block text-foreground">{formatMinuteOfDay(block.startMinute)}</span>
        <span className="block text-muted-foreground">{formatMinuteOfDay(block.endMinute)}</span>
      </div>
      <span aria-hidden="true" className="w-1 shrink-0 rounded-full" style={{ backgroundColor: block.classColor }} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", done && "line-through")}>
          {block.kind === "exam" && <span className="text-muted-foreground">Exam prep: </span>}
          {block.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {block.className} · {formatDuration(block.minutes)} · {block.dueLabel}
          {block.fromCanvas && " · Canvas"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {block.pinned && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Locked in place" />}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Why ${block.title} is here`}>
                <Info className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <PopoverContent className="w-64">
            <p className="text-xs font-medium text-muted-foreground">{REASON_LABELS[block.reasonCode]}</p>
            <ul className="mt-2 space-y-1">
              {block.reasons.map((r) => (
                <li key={r} className="text-sm">
                  {r}
                </li>
              ))}
              {block.pinned && <li className="text-sm">You placed this block yourself.</li>}
            </ul>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${block.title}`} disabled={pending}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {block.pinned ? (
              <DropdownMenuItem onClick={unlock}>
                <LockOpen className="h-4 w-4" /> Unlock
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={lock}>
                <Lock className="h-4 w-4" /> Lock here
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <MoveRight className="h-4 w-4" /> Move or resize
            </DropdownMenuItem>
            {block.kind === "assignment" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={complete}>
                  <Check className="h-4 w-4" /> Mark assignment done
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {editing && <BlockDialog block={block} dayOptions={dayOptions} open={editing} onOpenChange={setEditing} />}
    </li>
  );
}

export function ScheduleAgenda({ days, dayOptions }: { days: AgendaDay[]; dayOptions: DayOption[] }) {
  const reduce = useReducedMotion();
  return (
    <ol className="space-y-6">
      {days.map((day, i) => (
        <motion.li
          key={day.date}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(i, 6) * 0.04, ease: [0.16, 1, 0.3, 1] }}
          className="grid gap-3 md:grid-cols-[10rem_1fr] md:gap-6"
          aria-label={`${day.label}, ${day.dateLabel}`}
        >
          <div className="md:pt-2">
            <div className="flex items-baseline justify-between gap-2 md:block">
              <p className={cn("font-semibold", day.isToday && "text-brand-ink")}>{day.label}</p>
              <p className="text-xs text-muted-foreground">{day.dateLabel}</p>
            </div>
            {day.availableMinutes > 0 || day.plannedMinutes > 0 ? (
              <>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDuration(day.plannedMinutes)} / {formatDuration(Math.max(day.availableMinutes, day.plannedMinutes))}
                </p>
                <DayMeter planned={day.plannedMinutes} available={day.availableMinutes} />
              </>
            ) : null}
          </div>
          {day.blocks.length > 0 ? (
            <ul className="space-y-2">
              {day.blocks.map((b) => (
                <BlockRow key={b.key} block={b} dayOptions={dayOptions} />
              ))}
            </ul>
          ) : (
            <p
              className={cn(
                "text-sm text-muted-foreground md:pt-2",
                day.availableMinutes > 0 && "rounded-lg border border-dashed border-border px-4 py-3 md:pt-3",
              )}
            >
              {day.availableMinutes > 0
                ? "Open. Nothing needs this time yet."
                : day.isToday
                  ? "No study time left today."
                  : "No study time set for this day."}
            </p>
          )}
        </motion.li>
      ))}
    </ol>
  );
}
