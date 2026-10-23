"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { easeOutCubic, prefersReducedMotion, useHasMounted } from "./motion";
import { pulseDotClass } from "./pulse-dot";

// "Canvas lists everything. Rushd ranks it." Dragging the slider moves one example week
// from Canvas order (by due date) to Rushd order (by real Pulse values, see sample-week.ts).
// It plays once when seen; reduced motion just shows the Rushd order.

export interface RankRow {
  id: string;
  title: string;
  className: string;
  color: string;
  dueLabel: string;
  canvasIndex: number;
  rushdIndex: number;
  pulse: number;
  reason: string;
}

const ROW_HEIGHT = 60;

/** The number that is `t` of the way from `from` to `to`. */
function between(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Keeps a number between 0 and 1. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function RankSlider({ rows }: { rows: RankRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // 0 = Canvas order, 100 = Rushd order.
  const [value, setValue] = useState(0);
  const userTouched = useRef(false);
  // The server render (and a page without JS) shows the ranked outcome.
  const mounted = useHasMounted();
  const shown = mounted ? value : 100;

  // Play from Canvas to Rushd once, when the list scrolls into view.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion()) {
      const frame = requestAnimationFrame(() => setValue(100));
      return () => cancelAnimationFrame(frame);
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || userTouched.current) return;
        observer.disconnect();
        const startTime = performance.now();

        // Waits 500ms, then eases from 0 to 100 over 1.6s.
        function step(now: number) {
          if (userTouched.current) return;
          const t = Math.min(1, (now - startTime - 500) / 1600);
          setValue(easeOutCubic(Math.max(0, t)) * 100);
          if (t < 1) frame = requestAnimationFrame(step);
        }

        frame = requestAnimationFrame(step);
      },
      { threshold: 0.45 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const t = shown / 100;
  const ranked = t > 0.5;
  const pulseOpacity = clamp01((t - 0.45) / 0.4);

  return (
    <div ref={ref}>
      <div className="mb-4 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em]">
        <span className={cn("transition-colors", ranked ? "text-muted-foreground" : "text-foreground")}>Canvas · by due date</span>
        <span className={cn("transition-colors", ranked ? "text-signal-ink" : "text-muted-foreground")}>Rushd · by Pulse</span>
      </div>

      <ol className="relative" style={{ height: rows.length * ROW_HEIGHT }} aria-label={ranked ? "Example week ranked by Pulse" : "Example week in due-date order"}>
        {rows.map((row) => (
          <SliderRow key={row.id} row={row} rowCount={rows.length} t={t} ranked={ranked} pulseOpacity={pulseOpacity} />
        ))}
      </ol>

      <div className="mt-6">
        <label htmlFor="rank-slider" className="sr-only">
          Slide from Canvas order to Rushd order
        </label>
        <input
          id="rank-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(shown)}
          onChange={(e) => {
            userTouched.current = true;
            setValue(Number(e.target.value));
          }}
          aria-valuetext={ranked ? "Rushd order, by Pulse" : "Canvas order, by due date"}
          className="rank-slider w-full"
          style={{ ["--fill" as string]: `${shown}%` }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Pulse (1–99) is how strongly something needs you right now. These are computed by Rushd&apos;s planner on an example week.
        </p>
      </div>
    </div>
  );
}

function SliderRow({
  row,
  rowCount,
  t,
  ranked,
  pulseOpacity,
}: {
  row: RankRow;
  rowCount: number;
  /** 0 = Canvas order, 1 = Rushd order. */
  t: number;
  ranked: boolean;
  pulseOpacity: number;
}) {
  const top = between(row.canvasIndex, row.rushdIndex, easeOutCubic(t)) * ROW_HEIGHT;
  const isFirst = row.rushdIndex === 0 && t > 0.98;

  return (
    <li
      className={cn(
        "absolute inset-x-0 flex h-[52px] items-center gap-3 rounded-lg border bg-card px-3.5 transition-[border-color] duration-500 will-change-transform",
        isFirst ? "border-signal/70" : "border-border",
      )}
      style={{ transform: `translateY(${top}px)`, zIndex: rowCount - row.rushdIndex }}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {ranked ? row.reason : `${row.className} · due ${row.dueLabel}`}
        </span>
      </span>
      <span className="flex w-16 shrink-0 items-center justify-end gap-1.5" style={{ opacity: pulseOpacity }} aria-hidden={!ranked}>
        <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", pulseDotClass(row.pulse), isFirst && "pulse-live")} />
        <span className="font-mono text-sm tabular-nums">{row.pulse}</span>
      </span>
    </li>
  );
}
