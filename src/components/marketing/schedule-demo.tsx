"use client";

import { useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Plus, X } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { addDaysToKey, formatDateKey, formatMinuteOfDay } from "@/lib/time/zone";
import { presetToWindows } from "@/lib/planning/availability-presets";
import {
  DEFAULT_SAMPLE_OPTIONS,
  SAMPLE_NOW,
  SAMPLE_PRESETS,
  SAMPLE_START,
  SAMPLE_TZ,
  runSamplePlan,
  type SampleOptions,
} from "./sample-week";
import { localMinuteOfDay } from "@/lib/time/zone";
import { cn } from "@/lib/utils";

const PX_PER_MIN = 0.85;
const DAYS = Array.from({ length: 7 }, (_, i) => addDaysToKey(SAMPLE_START, i));
const NOW_MINUTE = localMinuteOfDay(SAMPLE_NOW, SAMPLE_TZ);

/**
 * A live, in-browser run of Rushd's actual scheduler on a sample week. Every
 * control re-runs the engine; blocks glide to wherever it places them.
 */
export function ScheduleDemo() {
  const reduce = useReducedMotion();
  const [options, setOptions] = useState<SampleOptions>(DEFAULT_SAMPLE_OPTIONS);
  const plan = useMemo(() => runSamplePlan(options), [options]);

  const togglePreset = (id: string) =>
    setOptions((o) => ({
      ...o,
      presetIds: o.presetIds.includes(id) ? o.presetIds.filter((p) => p !== id) : [...o.presetIds, id],
    }));

  // Stable identity per block so the same block animates between positions.
  const counters = new Map<string, number>();
  const blocks = plan.sessions.map((s) => {
    const n = counters.get(s.item.id) ?? 0;
    counters.set(s.item.id, n + 1);
    return { ...s, layoutKey: `${s.item.id}-${n}` };
  });
  const windows = options.presetIds.flatMap(presetToWindows);
  // The time axis hugs the selected study windows (with a little margin), so
  // the grid is about the hours that matter instead of mostly empty day.
  const axisStart = windows.length
    ? Math.floor((Math.min(...windows.map((w) => w.startMinute)) - 30) / 60) * 60
    : 15 * 60;
  const axisEnd = windows.length
    ? Math.ceil((Math.max(...windows.map((w) => w.endMinute)) + 30) / 60) * 60
    : 22 * 60;
  const hours = Array.from({ length: (axisEnd - axisStart) / 60 }, (_, i) => axisStart + i * 60);
  const nowVisible = NOW_MINUTE > axisStart && NOW_MINUTE < axisEnd;
  const planned = plan.sessions.reduce((n, s) => n + s.scheduledMinutes, 0);
  const shortfalls = (plan.warnings ?? []).flatMap((w) => (w.type === "DEADLINE_SHORTFALL" ? [w] : []));
  const noTime = (plan.warnings ?? []).some((w) => w.type === "NO_AVAILABILITY");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">When you&apos;re free</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLE_PRESETS.map((p) => {
              const on = options.presetIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePreset(p.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors active:scale-[0.98]",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="block font-medium leading-tight">{p.label}</span>
                  <span className={cn("block text-xs", on ? "opacity-80" : "text-muted-foreground")}>{p.detail}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground">Block length</legend>
            <div className="mt-2 flex rounded-lg border border-border bg-card p-0.5">
              {[30, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={options.sessionMinutes === m}
                  onClick={() => setOptions((o) => ({ ...o, sessionMinutes: m }))}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-mono text-xs tabular-nums transition-colors",
                    options.sessionMinutes === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}m
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
            {DAYS.map((d, i) => (
              <div key={d} className={cn("border-b border-l border-border px-2 py-2.5", i === 0 && "bg-accent/40")}>
                <p className="text-xs font-semibold">{formatDateKey(d, { weekday: "short" })}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatDateKey(d, { month: "short", day: "numeric" })}
                </p>
              </div>
            ))}

            <div className="relative" style={{ height: (axisEnd - axisStart) * PX_PER_MIN }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute right-2 translate-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: (h - axisStart) * PX_PER_MIN }}
                >
                  {formatMinuteOfDay(h).replace(":00", "")}
                </span>
              ))}
            </div>

            <LayoutGroup>
              {DAYS.map((d, dayIndex) => {
                const dow = (dayIndex + 1) % 7; // SAMPLE_START is a Monday
                return (
                  <div
                    key={d}
                    className="relative border-l border-border"
                    style={{ height: (axisEnd - axisStart) * PX_PER_MIN }}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        aria-hidden="true"
                        className="absolute inset-x-0 border-t border-border/60"
                        style={{ top: (h - axisStart) * PX_PER_MIN }}
                      />
                    ))}
                    {windows
                      .filter((w) => w.dayOfWeek === dow)
                      .map((w) => (
                        <div
                          key={`${w.startMinute}`}
                          aria-hidden="true"
                          className="absolute inset-x-0 bg-brand/[0.07] dark:bg-brand/[0.06]"
                          style={{ top: (w.startMinute - axisStart) * PX_PER_MIN, height: (w.endMinute - w.startMinute) * PX_PER_MIN }}
                        />
                      ))}
                    {dayIndex === 0 && nowVisible && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-0 z-10 border-t border-destructive/70"
                        style={{ top: (NOW_MINUTE - axisStart) * PX_PER_MIN }}
                      />
                    )}
                    {blocks
                      .filter((b) => b.scheduledDate === d)
                      .map((b) => (
                        <motion.div
                          key={b.layoutKey}
                          layoutId={reduce ? undefined : b.layoutKey}
                          layout={!reduce}
                          transition={{ type: "spring", stiffness: 260, damping: 30 }}
                          className="absolute inset-x-1 z-20 overflow-hidden rounded-md border-l-[3px] bg-card px-1.5 py-1 shadow-sm ring-1 ring-border"
                          style={{
                            top: ((b.startMinute ?? 0) - axisStart) * PX_PER_MIN,
                            height: Math.max(16, b.scheduledMinutes * PX_PER_MIN - 2),
                            borderLeftColor: b.item.classColor,
                          }}
                          title={`${b.item.title}, ${formatMinuteOfDay(b.startMinute ?? 0)} for ${formatDuration(b.scheduledMinutes)}`}
                        >
                          <p className="truncate text-[11px] font-medium leading-tight">{b.item.title}</p>
                          {b.scheduledMinutes >= 40 && (
                            <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                              {formatMinuteOfDay(b.startMinute ?? 0)}
                            </p>
                          )}
                        </motion.div>
                      ))}
                  </div>
                );
              })}
            </LayoutGroup>
          </div>
        </div>

        <div
          className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
        >
          {noTime ? (
            <p className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              No study time selected, so nothing can be placed. Rushd still tracks every deadline.
            </p>
          ) : shortfalls.length > 0 ? (
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                <span className="font-medium">
                  {formatDuration(shortfalls.reduce((n, s) => n + s.shortMinutes, 0))} won&apos;t fit before its deadline
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  ({shortfalls.map((s) => s.title).join(", ")}). Rushd says so, instead of quietly overbooking you.
                </span>
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              Everything fits before its deadline.
            </p>
          )}
          <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(planned)} planned · {plan.sessions.length} blocks
          </p>
        </div>
      </div>
    </div>
  );
}
