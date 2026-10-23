"use client";

import { useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Plus, X } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { addDaysToKey, formatDateKey, formatMinuteOfDay, localMinuteOfDay } from "@/lib/time/zone";
import { presetToWindows } from "@/lib/planning/availability-presets";
import type { AvailabilityWindow, PlanResult, PlanWarning, ScheduledSession } from "@/lib/planning/types";
import {
  DEFAULT_SAMPLE_OPTIONS,
  SAMPLE_NOW,
  SAMPLE_PRESETS,
  SAMPLE_START,
  SAMPLE_TZ,
  runSamplePlan,
  type SampleOptions,
} from "./sample-week";
import { cn } from "@/lib/utils";

// A live, in-browser run of Rushd's real scheduler on a sample week.
// Every control re-runs the engine; blocks glide to wherever it places them.

const PX_PER_MIN = 0.85;
const DAYS = Array.from({ length: 7 }, (_, i) => addDaysToKey(SAMPLE_START, i));
const NOW_MINUTE = localMinuteOfDay(SAMPLE_NOW, SAMPLE_TZ);
const BLOCK_LENGTHS = [30, 45, 60, 90];

type Block = ScheduledSession & { layoutKey: string };
type ShortfallWarning = Extract<PlanWarning, { type: "DEADLINE_SHORTFALL" }>;

// ---------- Plain helper functions ----------

/** Gives each block a stable key (item id + count) so the same block animates between spots. */
function withLayoutKeys(sessions: ScheduledSession[]): Block[] {
  const seenPerItem = new Map<string, number>();
  return sessions.map((session) => {
    const count = seenPerItem.get(session.item.id) ?? 0;
    seenPerItem.set(session.item.id, count + 1);
    return { ...session, layoutKey: `${session.item.id}-${count}` };
  });
}

/** The time axis hugs the chosen study windows (with ~30 min margin), rounded to whole hours. */
function timeAxis(windows: AvailabilityWindow[]): { axisStart: number; axisEnd: number } {
  if (windows.length === 0) return { axisStart: 15 * 60, axisEnd: 22 * 60 };
  const earliest = Math.min(...windows.map((w) => w.startMinute));
  const latest = Math.max(...windows.map((w) => w.endMinute));
  return {
    axisStart: Math.floor((earliest - 30) / 60) * 60,
    axisEnd: Math.ceil((latest + 30) / 60) * 60,
  };
}

function shortfallWarnings(plan: PlanResult): ShortfallWarning[] {
  return (plan.warnings ?? []).flatMap((w) => (w.type === "DEADLINE_SHORTFALL" ? [w] : []));
}

function hasNoStudyTime(plan: PlanResult): boolean {
  return (plan.warnings ?? []).some((w) => w.type === "NO_AVAILABILITY");
}

function togglePresetId(presetIds: string[], id: string): string[] {
  if (presetIds.includes(id)) return presetIds.filter((p) => p !== id);
  return [...presetIds, id];
}

// ---------- Main component ----------

export function ScheduleDemo() {
  const reduce = useReducedMotion();
  const [options, setOptions] = useState<SampleOptions>(DEFAULT_SAMPLE_OPTIONS);
  const plan = useMemo(() => runSamplePlan(options), [options]);

  function togglePreset(id: string) {
    setOptions((o) => ({ ...o, presetIds: togglePresetId(o.presetIds, id) }));
  }

  const blocks = withLayoutKeys(plan.sessions);
  const windows = options.presetIds.flatMap(presetToWindows);
  const { axisStart, axisEnd } = timeAxis(windows);
  const columnHeight = (axisEnd - axisStart) * PX_PER_MIN;
  const hours = Array.from({ length: (axisEnd - axisStart) / 60 }, (_, i) => axisStart + i * 60);
  const nowVisible = NOW_MINUTE > axisStart && NOW_MINUTE < axisEnd;
  const plannedMinutes = plan.sessions.reduce((sum, s) => sum + s.scheduledMinutes, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">When you&apos;re free</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLE_PRESETS.map((preset) => {
              const on = options.presetIds.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePreset(preset.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors active:scale-[0.98]",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="block font-medium leading-tight">{preset.label}</span>
                  <span className={cn("block text-xs", on ? "opacity-80" : "text-muted-foreground")}>{preset.detail}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground">Block length</legend>
            <div className="mt-2 flex rounded-lg border border-border bg-card p-0.5">
              {BLOCK_LENGTHS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={options.sessionMinutes === minutes}
                  onClick={() => setOptions((o) => ({ ...o, sessionMinutes: minutes }))}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-mono text-xs tabular-nums transition-colors",
                    options.sessionMinutes === minutes ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {minutes}m
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            aria-pressed={options.surprise}
            onClick={() => setOptions((o) => ({ ...o, surprise: !o.surprise }))}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors active:scale-[0.98]",
              options.surprise ? "border-warning/50 bg-warning/10" : "border-border bg-card hover:bg-muted",
            )}
          >
            {options.surprise ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            {options.surprise ? "Remove surprise assignment" : "Drop in a surprise assignment"}
          </button>
        </div>
      </div>

      <div className="surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[3.5rem_repeat(7,1fr)]">
            <div className="border-b border-border" />
            {DAYS.map((day, i) => (
              <div key={day} className={cn("border-b border-l border-border px-2 py-2.5", i === 0 && "bg-accent/40")}>
                <p className="text-xs font-semibold">{formatDateKey(day, { weekday: "short" })}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatDateKey(day, { month: "short", day: "numeric" })}
                </p>
              </div>
            ))}

            <div className="relative" style={{ height: columnHeight }}>
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-2 translate-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: (hour - axisStart) * PX_PER_MIN }}
                >
                  {formatMinuteOfDay(hour).replace(":00", "")}
                </span>
              ))}
            </div>

            <LayoutGroup>
              {DAYS.map((day, dayIndex) => (
                <DayColumn
                  key={day}
                  day={day}
                  dayIndex={dayIndex}
                  height={columnHeight}
                  axisStart={axisStart}
                  hours={hours}
                  windows={windows}
                  blocks={blocks}
                  showNow={dayIndex === 0 && nowVisible}
                  reduce={!!reduce}
                />
              ))}
            </LayoutGroup>
          </div>
        </div>

        <div
          className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
        >
          <PlanStatus noTime={hasNoStudyTime(plan)} shortfalls={shortfallWarnings(plan)} />
          <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(plannedMinutes)} planned · {plan.sessions.length} blocks
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------- Pieces ----------

function DayColumn({
  day,
  dayIndex,
  height,
  axisStart,
  hours,
  windows,
  blocks,
  showNow,
  reduce,
}: {
  day: string;
  dayIndex: number;
  height: number;
  axisStart: number;
  hours: number[];
  windows: AvailabilityWindow[];
  blocks: Block[];
  showNow: boolean;
  reduce: boolean;
}) {
  const dayOfWeek = (dayIndex + 1) % 7; // SAMPLE_START is a Monday

  return (
    <div className="relative border-l border-border" style={{ height }}>
      {hours.map((hour) => (
        <div
          key={hour}
          aria-hidden="true"
          className="absolute inset-x-0 border-t border-border/60"
          style={{ top: (hour - axisStart) * PX_PER_MIN }}
        />
      ))}
      {windows
        .filter((w) => w.dayOfWeek === dayOfWeek)
        .map((w) => (
          <div
            key={`${w.startMinute}`}
            aria-hidden="true"
            className="absolute inset-x-0 bg-brand/[0.07] dark:bg-brand/[0.06]"
            style={{ top: (w.startMinute - axisStart) * PX_PER_MIN, height: (w.endMinute - w.startMinute) * PX_PER_MIN }}
          />
        ))}
      {showNow && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 z-10 border-t border-destructive/70"
          style={{ top: (NOW_MINUTE - axisStart) * PX_PER_MIN }}
        />
      )}
      {blocks
        .filter((block) => block.scheduledDate === day)
        .map((block) => {
          const start = block.startMinute ?? 0;
          return (
            <motion.div
              key={block.layoutKey}
              layoutId={reduce ? undefined : block.layoutKey}
              layout={!reduce}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="absolute inset-x-1 z-20 overflow-hidden rounded-md border-l-[3px] bg-card px-1.5 py-1 shadow-sm ring-1 ring-border"
              style={{
                top: (start - axisStart) * PX_PER_MIN,
                height: Math.max(16, block.scheduledMinutes * PX_PER_MIN - 2),
                borderLeftColor: block.item.classColor,
              }}
              title={`${block.item.title}, ${formatMinuteOfDay(start)} for ${formatDuration(block.scheduledMinutes)}`}
            >
              <p className="truncate text-[11px] font-medium leading-tight">{block.item.title}</p>
              {block.scheduledMinutes >= 40 && (
                <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                  {formatMinuteOfDay(start)}
                </p>
              )}
            </motion.div>
          );
        })}
    </div>
  );
}

/** One line saying whether the plan fits, read out to screen readers when it changes. */
function PlanStatus({ noTime, shortfalls }: { noTime: boolean; shortfalls: ShortfallWarning[] }) {
  if (noTime) {
    return (
      <p className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
        No study time selected, so nothing can be placed. Rushd still tracks every deadline.
      </p>
    );
  }

  if (shortfalls.length > 0) {
    const shortMinutes = shortfalls.reduce((sum, s) => sum + s.shortMinutes, 0);
    return (
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          <span className="font-medium">
            {formatDuration(shortMinutes)} won&apos;t fit before its deadline
          </span>
          <span className="text-muted-foreground">
            {" "}
            ({shortfalls.map((s) => s.title).join(", ")}). Rushd says so, instead of quietly overbooking you.
          </span>
        </span>
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
      Everything fits before its deadline.
    </p>
  );
}
