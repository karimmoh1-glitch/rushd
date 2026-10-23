"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RankSlider, type RankRow } from "./rank-slider";
import { useHasMounted, usePrefersReducedMotion } from "./motion";

// The signature moment: the week settles into Rushd order, then the app frame walks
// the loop (coursework, quiz, gap, watch, next step). Plays once when seen, no
// scroll-jacking; reduced motion shows the last step. Example content throughout.

const STAGES = ["Courses", "Quiz", "Gap", "Watch", "Next"] as const;
const LAST_STAGE = STAGES.length - 1;

const COURSE_ITEMS = [
  { kind: "Page", title: "The chain rule, with examples" },
  { kind: "Assignment", title: "Problem set 5.3 · rubric" },
  { kind: "Quiz", title: "Derivatives check · Friday" },
];

// ---------- One panel per stage ----------

function CoursesPanel() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">Calculus · synced from Canvas</p>
      <p className="font-medium">Unit 4: Derivatives</p>
      <ul className="space-y-1.5">
        {COURSE_ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">{item.kind}</span>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}

function QuizPanel() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">Tutor · Quiz me</p>
      <p>Quick check from your Unit 4 page: what&apos;s the derivative of sin(3x²)?</p>
      <p className="ml-auto max-w-[80%] rounded-lg bg-muted px-3 py-2">cos(3x²)</p>
      <p>Close. You differentiated the outside but dropped the inside. What&apos;s the derivative of 3x²?</p>
    </div>
  );
}

function GapPanel() {
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

function WatchPanel() {
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

function NextStepPanel() {
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

function Panel({ stage }: { stage: number }) {
  if (stage === 0) return <CoursesPanel />;
  if (stage === 1) return <QuizPanel />;
  if (stage === 2) return <GapPanel />;
  if (stage === 3) return <WatchPanel />;
  return <NextStepPanel />;
}

// ---------- Helpers ----------

/** Filled dot for the current and earlier steps; the last step glows in the signal color. */
function stageDotClass(currentStage: number, dotStage: number): string {
  if (currentStage === dotStage) {
    return dotStage === LAST_STAGE ? "border-signal bg-signal" : "border-foreground bg-foreground";
  }
  if (currentStage > dotStage) return "border-foreground bg-foreground";
  return "border-foreground/30 bg-card";
}

// ---------- Main component ----------

export function SignatureLoop({ rows }: { rows: RankRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const mounted = useHasMounted();
  const [seen, setSeen] = useState(false);
  const [pickedStage, setPickedStage] = useState<number | null>(null);
  const [autoStage, setAutoStage] = useState(0);

  // Server render, no JS, and reduced motion all show the last step; nothing
  // auto-advances until the page is interactive.
  let stage = autoStage;
  if (pickedStage !== null) stage = pickedStage;
  else if (reduceMotion || !mounted) stage = LAST_STAGE;
  const autoAdvancing = pickedStage === null && !reduceMotion;

  // Notice when the section first scrolls into view.
  useEffect(() => {
    if (reduceMotion) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduceMotion]);

  // Step through the loop every 2.6s and stop on the last step.
  useEffect(() => {
    if (!seen || !autoAdvancing) return;
    const timer = setInterval(() => setAutoStage((current) => Math.min(current + 1, LAST_STAGE)), 2600);
    return () => clearInterval(timer);
  }, [seen, autoAdvancing]);

  return (
    <div ref={ref} className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <RankSlider rows={rows} />

      <div className="relative z-10 rounded-xl border border-border bg-card">
        <div className="relative border-b border-border px-4 pb-3 pt-4">
          <span aria-hidden="true" className="absolute left-[calc(1rem+6px)] right-[calc(1rem+6px)] top-[22px] h-px bg-border" />
          <div role="tablist" aria-label="The Rushd loop" className="relative grid grid-cols-5">
            {STAGES.map((label, i) => (
              <button
                key={label}
                role="tab"
                aria-selected={stage === i}
                onClick={() => setPickedStage(i)}
                className="group flex flex-col items-center gap-2 first:items-start last:items-end"
              >
                <span
                  aria-hidden="true"
                  className={cn("h-3 w-3 rounded-full border-2 transition-colors duration-300", stageDotClass(stage, i))}
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
