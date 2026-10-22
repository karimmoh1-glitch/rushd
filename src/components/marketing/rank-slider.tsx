"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

// "Canvas lists everything. Rushd ranks it." A slider morphs one week of work
// from Canvas's order (by due date, unranked) into Rushd's order (by Pulse).
// Pulse values come from Rushd's real planning engine run on the example
// week (see sample-week.ts). On entering view it plays once from Canvas to
// Rushd; after that it's the student's to drag. Reduced motion: shows the
// Rushd order and doesn't auto-play.

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

const ROW = 60;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function RankSlider({ rows }: { rows: RankRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const touched = useRef(false);
  // The server render (and a page without JS) shows the ranked outcome; once
  // hydrated the slider starts from Canvas order and plays when seen.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const shown = hydrated ? value : 100;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setValue(100));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || touched.current) return;
        io.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          if (touched.current) return;
          const t = Math.min(1, (now - start - 500) / 1600);
          setValue(Math.max(0, ease(Math.max(0, t))) * 100);
          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const t = shown / 100;
  const ranked = t > 0.5;
  const pulseOpacity = Math.max(0, Math.min(1, (t - 0.45) / 0.4));

  return (
    <div ref={ref}>
      <div className="mb-4 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em]">
        <span className={cn("transition-colors", ranked ? "text-muted-foreground" : "text-foreground")}>Canvas · by due date</span>
        <span className={cn("transition-colors", ranked ? "text-signal-ink" : "text-muted-foreground")}>Rushd · by Pulse</span>
      </div>

      <ol className="relative" style={{ height: rows.length * ROW }} aria-label={ranked ? "Example week ranked by Pulse" : "Example week in due-date order"}>
        {rows.map((r) => {
          const top = lerp(r.canvasIndex, r.rushdIndex, ease(t)) * ROW;
          const first = r.rushdIndex === 0 && t > 0.98;
          return (
            <li
              key={r.id}
              className={cn(
                "absolute inset-x-0 flex h-[52px] items-center gap-3 rounded-lg border bg-card px-3.5 transition-[border-color] duration-500 will-change-transform",
                first ? "border-signal/70" : "border-border",
              )}
              style={{ transform: `translateY(${top}px)`, zIndex: rows.length - r.rushdIndex }}
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ranked ? r.reason : `${r.className} · due ${r.dueLabel}`}
                </span>
              </span>
              <span className="flex w-16 shrink-0 items-center justify-end gap-1.5" style={{ opacity: pulseOpacity }} aria-hidden={!ranked}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full",
                    r.pulse >= 70 ? "bg-signal" : r.pulse >= 40 ? "bg-foreground" : "border-[1.5px] border-foreground/45",
                    first && "pulse-live",
                  )}
                />
                <span className="font-mono text-sm tabular-nums">{r.pulse}</span>
              </span>
            </li>
          );
        })}
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
            touched.current = true;
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
