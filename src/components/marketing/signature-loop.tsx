"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// The signature moment. A week's coursework arrives scattered; when the
// section comes into view it settles onto the Rushd path in the order it
// should be done, and the top item lights as the next step. Then the app
// frame walks the loop: coursework, understanding, check, next step.
// Triggered once on entry (no scroll-jacking); static and ordered under
// reduced motion. Example content throughout.

interface Item {
  title: string;
  meta: string;
  kind: string;
  /** Position once ordered (0 = do first). */
  rank: number;
  scatter: { x: number; y: number; r: number };
}

const ITEMS: Item[] = [
  { title: "Gatsby ch. 6 annotations", meta: "English 11 · Fri", kind: "Reading", rank: 4, scatter: { x: 30, y: -40, r: -6 } },
  { title: "Review the chain rule with trig", meta: "Calculus · from your quiz", kind: "Gap", rank: 0, scatter: { x: 70, y: 210, r: 5 } },
  { title: "Unit 3 notes posted", meta: "AP Chemistry · page", kind: "Page", rank: 5, scatter: { x: -10, y: -160, r: 7 } },
  { title: "Titration lab report", meta: "AP Chemistry · Thu · 40 pts", kind: "Assignment", rank: 1, scatter: { x: 80, y: 110, r: -4 } },
  { title: "Limiting reagents quiz", meta: "AP Chemistry · Fri", kind: "Quiz", rank: 2, scatter: { x: -20, y: 60, r: -8 } },
  { title: "Lab moved to Thursday", meta: "Announcement", kind: "News", rank: 6, scatter: { x: 50, y: -250, r: 3 } },
  { title: "Problem set 5.3", meta: "Calculus · Mon", kind: "Assignment", rank: 3, scatter: { x: 40, y: 90, r: 9 } },
];

const ROW = 56;
const STAGES = ["Courses", "Quiz", "Gap", "Watch", "Next"] as const;

function Panel({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Calculus · synced from Canvas</p>
        <p className="font-medium">Unit 4: Derivatives</p>
        <ul className="space-y-1.5">
          {[["Page", "The chain rule, with examples"], ["Assignment", "Problem set 5.3 · rubric"], ["Quiz", "Derivatives check · Friday"]].map(([k, t]) => (
            <li key={t} className="flex gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">{k}</span>{t}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (stage === 1) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Tutor · Quiz me</p>
        <p>Quick check from your Unit 4 page: what&apos;s the derivative of sin(3x²)?</p>
        <p className="ml-auto max-w-[80%] rounded-lg bg-muted px-3 py-2">cos(3x²)</p>
        <p>Close. You differentiated the outside but dropped the inside. What&apos;s the derivative of 3x²?</p>
      </div>
    );
  }
  if (stage === 2) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">From the quiz and a photo of your worksheet</p>
        <p className="font-display text-3xl font-medium tabular-nums tracking-tight">55–75%</p>
        <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-signal" style={{ marginLeft: "55%", width: "20%" }} /></div>
        <p><span className="font-medium">Gap:</span> the chain rule with trig. It builds on derivatives of sin and cos.</p>
        <p className="text-xs text-muted-foreground">An estimate from a few answers, not a grade.</p>
      </div>
    );
  }
  if (stage === 3) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Picked for this gap</p>
        <ul className="space-y-2.5">
          <li className="flex gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">Video</span>The chain rule with trig functions · 10 min</li>
          <li className="flex gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">Practice</span>3 problems on composite trig, easy to hard</li>
          <li className="flex gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">Your notes</span>Unit 4 page, example 2</li>
        </ul>
        <p className="text-xs text-muted-foreground">Videos come only from established education channels and are checked to exist.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-signal-ink">
        <span className="h-2 w-2 rounded-full bg-signal" />
        Next step · today 4:30 PM
      </p>
      <p className="font-display text-2xl font-medium leading-tight tracking-tight">Review the chain rule with trig</p>
      <p className="text-muted-foreground">25 min, then a quick re-quiz. Planned around your problem set and Friday&apos;s quiz.</p>
    </div>
  );
}

const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function SignatureLoop() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE).matches, () => false);
  const [seen, setSeen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [autoStage, setAutoStage] = useState(0);
  // Reduced motion: already ordered, showing the outcome, nothing moves.
  const ordered = seen || reduce;
  const stage = picked ?? (reduce ? STAGES.length - 1 : autoStage);
  const auto = picked === null && !reduce;

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    if (!seen || !auto) return;
    const last = STAGES.length - 1;
    const timer = setInterval(() => setAutoStage((s) => (s >= last ? last : s + 1)), 2600);
    return () => clearInterval(timer);
  }, [seen, auto]);

  function pick(i: number) {
    setPicked(i);
  }

  return (
    <div ref={ref} className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      {/* --k scales the scatter down on narrow screens so nothing overflows. */}
      <div className="relative [--k:0.3] sm:[--k:0.7] lg:[--k:1]" style={{ height: ITEMS.length * ROW }} data-ordered={ordered}>
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-3 w-px origin-top bg-foreground/25 transition-transform duration-700 ease-[var(--ease-settle)]"
          style={{ height: (ITEMS.length - 1) * ROW, transform: ordered ? "scaleY(1)" : "scaleY(0)", transitionDelay: ordered ? "450ms" : "0ms" }}
        />
        <ol aria-label="A week of coursework, in the order Rushd suggests">
          {[...ITEMS].sort((a, b) => a.rank - b.rank).map((item) => {
            const first = item.rank === 0;
            const s = item.scatter;
            return (
              <li
                key={item.title}
                className="absolute inset-x-0 flex items-center gap-3 pl-0 transition-[transform,opacity] duration-[900ms] ease-[var(--ease-settle)] will-change-transform"
                style={{
                  top: item.rank * ROW,
                  transform: ordered ? "none" : `translate(calc(var(--k) * ${s.x}px), calc(var(--k) * ${s.y}px)) rotate(${s.r}deg)`,
                  opacity: ordered ? 1 : 0.85,
                  transitionDelay: `${item.rank * 60}ms`,
                }}
              >
                <span aria-hidden="true" className="relative z-10 flex w-[23px] shrink-0 justify-center">
                  <span
                    className={cn(
                      "rounded-full transition-all duration-500",
                      first && ordered ? "h-[13px] w-[13px] bg-signal" : "h-[9px] w-[9px] bg-foreground",
                    )}
                    style={{ transitionDelay: first ? "900ms" : "0ms" }}
                  />
                </span>
                <span
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5 transition-colors duration-500",
                    first && ordered ? "border-signal/60" : "border-border",
                  )}
                  style={{ transitionDelay: first ? "900ms" : "0ms" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
                  </span>
                  <span className={cn("shrink-0 text-[11px] font-medium uppercase tracking-[0.12em]", first && ordered ? "text-signal-ink" : "text-muted-foreground")}>
                    {first && ordered ? "Next step" : item.kind}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative z-10 rounded-xl border border-border bg-card">
        <div className="relative border-b border-border px-4 pb-3 pt-4">
          <span aria-hidden="true" className="absolute left-[calc(1rem+6px)] right-[calc(1rem+6px)] top-[22px] h-px bg-border" />
          <div role="tablist" aria-label="The Rushd loop" className="relative grid grid-cols-5">
            {STAGES.map((label, i) => (
              <button
                key={label}
                role="tab"
                aria-selected={stage === i}
                onClick={() => pick(i)}
                className="group flex flex-col items-center gap-2 first:items-start last:items-end"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-3 w-3 rounded-full border-2 transition-colors duration-300",
                    stage === i ? (i === STAGES.length - 1 ? "border-signal bg-signal" : "border-foreground bg-foreground") : stage > i ? "border-foreground bg-foreground" : "border-foreground/30 bg-card",
                  )}
                />
                <span className={cn("text-xs transition-colors", stage === i ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel" className="min-h-[13.5rem] p-5">
          <div key={stage} className="anim-fade">
            <Panel stage={stage} />
          </div>
        </div>
        <p className="border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">Demo with example content, not a real student&apos;s account.</p>
      </div>
    </div>
  );
}
