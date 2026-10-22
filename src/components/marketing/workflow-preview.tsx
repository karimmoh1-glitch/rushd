"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Camera, MessageSquareText, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// The hero's product preview: four states of the real interface, filled with
// clearly labeled example content (no real student, no real results). Tabs
// work with keyboard and without auto-advance; auto-advance stops on any
// interaction and never runs with reduced motion.

const TABS = [
  { id: "plan", label: "Plan", icon: CalendarClock },
  { id: "tutor", label: "Tutor", icon: MessageSquareText },
  { id: "check", label: "Check work", icon: Camera },
  { id: "mastery", label: "Mastery", icon: Target },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

const CHEM = "#4f46e5";
const CALC = "#0f766e";
const ENG = "#b45309";

function PlanPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="text-xs font-medium text-muted-foreground">Next up</p>
        <p className="mt-1 flex items-center gap-2 text-base font-semibold"><Dot color={CHEM} />Titration lab report</p>
        <p className="mt-0.5 text-xs text-muted-foreground">AP Chemistry · 1h left · planned today at 4:30 PM</p>
        <ul className="mt-2 space-y-0.5 text-xs text-foreground/80">
          <li>· Due Thursday and worth 40 points, the most this week</li>
          <li>· Your rubric weighs error analysis heavily</li>
        </ul>
      </div>
      <ul className="divide-y divide-border text-sm">
        {[
          ["3:45 PM", "Chain rule problem set", "Calculus", CALC, "45 min"],
          ["4:30 PM", "Titration lab report", "AP Chemistry", CHEM, "1h"],
          ["5:40 PM", "Gatsby ch. 6 annotations", "English 11", ENG, "30 min"],
        ].map(([t, title, cls, color, len]) => (
          <li key={title} className="flex items-center gap-3 py-2">
            <span className="w-16 font-mono text-[11px] tabular-nums text-muted-foreground">{t}</span>
            <span aria-hidden="true" className="h-7 w-1 rounded-full" style={{ backgroundColor: color }} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{cls} · {len}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TutorPanel() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">About: AP Chemistry · Explain</p>
      <div className="ml-auto max-w-[85%] rounded-lg bg-muted px-3 py-2">Why do we stop at the endpoint instead of adding more base?</div>
      <div className="space-y-2">
        <p>
          Past the endpoint every drop is excess base, so the volume you record no longer matches the moles of acid. Your
          Unit 3 notes put it as “equivalence = equal moles reacted”<sup className="px-0.5 text-[10px] text-muted-foreground">[1]</sup>.
        </p>
        <p>Quick check: if you overshoot by 0.5 mL, does your calculated concentration come out high or low?</p>
      </div>
      <p className="border-t border-border pt-2 text-xs text-muted-foreground">[1] Unit 3: Titration notes · Page · AP Chemistry · Canvas</p>
    </div>
  );
}

function CheckPanel() {
  return (
    <div className="grid gap-4 sm:grid-cols-[5.5rem_1fr]">
      <div aria-hidden="true" className="hidden h-28 rounded-md border border-border bg-background p-2 sm:block">
        {[70, 85, 55, 90, 60, 75, 40].map((w, i) => (
          <div key={i} className="mb-2 h-1 rounded-full bg-muted-foreground/30" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Estimate from this check · Chain rule</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">55–75%</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ marginLeft: "55%", width: "20%" }} /></div>
          <p className="mt-1 text-xs text-muted-foreground">5 answers checked · medium confidence · not a grade</p>
        </div>
        <div className="text-sm">
          <p className="font-medium">Gap: chain rule with trig functions</p>
          <p className="text-xs text-muted-foreground">Q3 and Q5 dropped the inner derivative · builds on derivatives of sin and cos</p>
        </div>
        <p className="text-xs text-muted-foreground">Next: 3 targeted problems · a verified video · review with the tutor</p>
      </div>
    </div>
  );
}

function MasteryPanel() {
  const rows = [
    ["Limits", 78, 92, "Strong"],
    ["Power rule", 70, 90, "Strong"],
    ["Chain rule", 52, 72, "Review next"],
    ["Implicit differentiation", 30, 70, "Too early to tell"],
  ] as const;
  return (
    <ul className="space-y-3">
      {rows.map(([topic, lo, hi, status]) => (
        <li key={topic}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{topic}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{lo}–{hi}% · {status}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ marginLeft: `${lo}%`, width: `${hi - lo}%` }} /></div>
        </li>
      ))}
      <li className="pt-1 text-xs text-muted-foreground">Ranges narrow as you do more checks. Recent work counts more.</li>
    </ul>
  );
}

const PANELS: Record<TabId, () => React.JSX.Element> = { plan: PlanPanel, tutor: TutorPanel, check: CheckPanel, mastery: MasteryPanel };

export function WorkflowPreview() {
  const [active, setActive] = useState<TabId>("plan");
  const [auto, setAuto] = useState(true);
  // The first panel renders without an entrance effect; only changes fade.
  const [changed, setChanged] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setChanged(true);
      setActive((current) => TABS[(TABS.findIndex((t) => t.id === current) + 1) % TABS.length].id);
    }, 5500);
    return () => clearInterval(timer);
  }, [auto]);

  function select(id: TabId) {
    setAuto(false);
    setChanged(true);
    setActive(id);
  }

  function onKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    select(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const Panel = PANELS[active];
  return (
    <div
      className="surface overflow-hidden rounded-xl"
      onPointerEnter={() => setAuto(false)}
      onFocusCapture={() => setAuto(false)}
    >
      <div className="border-b border-border px-3 py-2">
        <div role="tablist" aria-label="Rushd preview" className="flex gap-0.5 overflow-x-auto">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`preview-tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls="preview-panel"
              tabIndex={active === t.id ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                active === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${active}`} className="min-h-[19rem] p-4 sm:p-5">
        <div key={active} className={changed ? "anim-fade" : undefined}>
          <Panel />
        </div>
      </div>
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Interactive preview with example content, not a real student&apos;s account.
      </p>
    </div>
  );
}
