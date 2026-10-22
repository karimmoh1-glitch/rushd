"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseWeek, toWorkItems } from "@/lib/try/parse-week";
import { generatePlan } from "@/lib/planning/schedule";
import { presetToWindows } from "@/lib/planning/availability-presets";
import { formatDateKey, formatMinuteOfDay, localDateKey, diffDateKeys } from "@/lib/time/zone";
import type { PlanResult } from "@/lib/planning/types";

// Exam study planner: list the tests and how much prep each needs; Rushd's
// scheduler spreads the prep over the days before each one, inside the study
// times picked here. Runs entirely in the browser.

const EXAMPLE = `AP Bio final Dec 14 6h
Calc final Dec 16 8h
History essay due Dec 11 3h
Spanish oral exam Dec 17 2h`;

const PRESETS = [
  { id: "weekday-afternoon", label: "Weekday afternoons" },
  { id: "weekday-evening", label: "Weekday evenings" },
  { id: "weekend-morning", label: "Weekend mornings" },
  { id: "weekend-afternoon", label: "Weekend afternoons" },
];

function count(path: string) {
  try {
    if (!navigator.sendBeacon?.("/api/pv", path)) void fetch("/api/pv", { method: "POST", body: path, keepalive: true });
  } catch {
    // Analytics never affects the page.
  }
}

function hours(m: number) {
  const h = Math.round((m / 60) * 10) / 10;
  return `${h}h`;
}

export function ExamPlanner() {
  const [text, setText] = useState(EXAMPLE);
  const [presets, setPresets] = useState<string[]>(["weekday-evening", "weekend-afternoon"]);
  const [session, setSession] = useState(60);
  const [plan, setPlan] = useState<{ result: PlanResult; tz: string } | null>(null);
  const [counted, setCounted] = useState(false);

  function build() {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const items = parseWeek(text, now);
    if (items.length === 0) return;
    const today = localDateKey(now, tz);
    const lastKey = items.map((i) => localDateKey(new Date(i.dueAt), tz)).sort().at(-1)!;
    const horizonDays = Math.min(60, Math.max(1, diffDateKeys(today, lastKey) + 1));
    const result = generatePlan({
      workItems: toWorkItems(items),
      availability: presets.flatMap(presetToWindows),
      now,
      timeZone: tz,
      horizonDays,
      preferences: { preferredSessionMinutes: session, maxDailyMinutes: 240, breakMinutes: 10 },
    });
    setPlan({ result, tz });
    if (!counted) {
      setCounted(true);
      count("#exam-plan");
    }
  }

  const byDay = new Map<string, PlanResult["sessions"]>();
  for (const s of plan?.result.sessions ?? []) byDay.set(s.scheduledDate, [...(byDay.get(s.scheduledDate) ?? []), s]);
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const short = Object.entries(plan?.result.unscheduledMinutesByItem ?? {}).filter(([, m]) => m > 0);
  const titleOf = (id: string) => plan?.result.scored.find((s) => s.item.id === id)?.item.title ?? "";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          build();
        }}
      >
        <label htmlFor="exam-list" className="text-sm font-medium">
          Your tests and big assignments, one per line, with the prep time you think each needs
        </label>
        <textarea
          id="exam-list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={2400}
          spellCheck={false}
          className="mt-2 block w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-[1.7] outline-none focus-visible:border-foreground/40"
        />
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">When can you study?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = presets.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPresets(on ? presets.filter((x) => x !== p.id) : [...presets, p.id])}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sessions of
            <select value={session} onChange={(e) => setSession(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1 text-foreground">
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.98]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            Make my plan
          </button>
        </div>
      </form>

      {plan && (
        <div className="mt-6 border-t border-border pt-5" aria-live="polite">
          {presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pick at least one study time above.</p>
          ) : days.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to schedule yet. Prep starts two weeks before each date; add dates that are coming up.</p>
          ) : (
            <ol className="space-y-4">
              {days.map(([day, sessions]) => (
                <li key={day} className="grid gap-2 sm:grid-cols-[8.5rem_1fr]">
                  <p className="text-sm font-medium">{formatDateKey(day, { weekday: "short", month: "short", day: "numeric" })}</p>
                  <ul className="space-y-1.5">
                    {sessions.map((s, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.item.classColor }} />
                        <span className="min-w-0 flex-1 truncate">{s.item.title}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {s.startMinute !== undefined ? `${formatMinuteOfDay(s.startMinute)} · ` : ""}
                          {s.scheduledMinutes}m
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {short.length > 0 && (
            <p className="mt-5 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
              Doesn&apos;t fit yet: {short.map(([id, m]) => `${titleOf(id)} (${hours(m)} short)`).join(", ")}. Add study times or start earlier.
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/signup" className="group inline-flex h-10 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Keep this plan up to date, free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <span className="text-xs text-muted-foreground">Rushd re-plans every day as things change.</span>
          </div>
        </div>
      )}
    </div>
  );
}
