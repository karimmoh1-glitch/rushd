"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseWeek, toWorkItems, TRY_STORAGE_KEY, type TryItem } from "@/lib/try/parse-week";
import { scoreAndRank } from "@/lib/planning/score";
import { explainScore } from "@/lib/planning/explain";
import { pulseOf } from "@/lib/planning/pulse";
import { countOnce } from "@/lib/analytics/beacon";
import { SCORING_WEIGHTS } from "@/lib/planning/constants";

// The homepage's instant-value moment: type your week, the real planner ranks
// it by Pulse right here in the browser. Nothing typed is sent anywhere; the
// only network call is an anonymous "#try" count. "Save" keeps the list in
// this browser so it can be added to a new account after signup.

const EXAMPLE = `Chem: lab report Thursday 2h
Calc quiz Friday
English essay draft Monday 3h
Spanish vocab worksheet tomorrow
History reading notes Wednesday 40m`;

const ROW = 58;

// Shared weeks travel in the URL hash, which browsers never send to a server.
function encodeWeek(text: string): string {
  const bytes = new TextEncoder().encode(text.slice(0, 2400));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeWeek(code: string): string | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))).slice(0, 2400);
  } catch {
    return null;
  }
}

interface Ranked {
  key: string;
  title: string;
  className: string;
  color: string;
  inputIndex: number;
  rank: number;
  pulse: number;
  reason: string;
  assumedDate: boolean;
  minutes: number;
  /** What went into the score, from the planner's own breakdown. */
  parts: { label: string; points: number }[];
}

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

function fmtMinutes(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

export function RankMyWeek({ compact = false, autoplay = false }: { compact?: boolean; autoplay?: boolean }) {
  const router = useRouter();
  const reduce = useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE).matches, () => false);
  const [text, setText] = useState(EXAMPLE);
  const [items, setItems] = useState<TryItem[] | null>(null);
  const [rows, setRows] = useState<Ranked[] | null>(null);
  const [settled, setSettled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shared, setShared] = useState(false);
  const [typing, setTyping] = useState(false);
  const [autoRanked, setAutoRanked] = useState(false);
  const [selected, setSelected] = useState(0);
  const counted = useRef(false);
  const touched = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function rank(source = text, fromUser = true) {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parsed = parseWeek(source, now);
    if (parsed.length === 0) {
      inputRef.current?.focus();
      return;
    }
    const scored = scoreAndRank(toWorkItems(parsed), now, tz);
    const next: Ranked[] = scored.map((s, rank) => {
      const inputIndex = Number(s.item.id.slice(4));
      return {
        key: `${s.item.id}-${s.item.title}`,
        title: s.item.title,
        className: s.item.className,
        color: s.item.classColor,
        inputIndex,
        rank,
        pulse: pulseOf(s.score),
        reason: explainScore(s, now, scored, tz)[0] ?? s.item.className,
        assumedDate: parsed[inputIndex].assumedDate,
        minutes: s.item.remainingMinutes,
        parts: (
          [
            ["How soon it's due", s.breakdown.urgency],
            ["Test coming up", s.breakdown.examProximity],
            ["Already late", s.breakdown.overdue],
            ["Priority", s.breakdown.importance],
            ["Quick win", s.breakdown.effortTiebreak * SCORING_WEIGHTS.effortTiebreakWeight],
          ] as [string, number][]
        )
          .filter(([, p]) => p >= 0.5)
          .sort((a, b) => b[1] - a[1])
          .map(([label, points]) => ({ label, points })),
      };
    });
    setItems(parsed);
    setRows(next);
    setSelected(0);
    setSettled(reduce);
    setProgress(reduce ? 1 : 0);
    if (!counted.current) {
      counted.current = true;
      countOnce("#try");
    }
    // The form is replaced by the results: keep keyboard and screen-reader users with it.
    if (fromUser) requestAnimationFrame(() => resultsRef.current?.focus());
  }

  // First homepage visit this session (the brand intro is playing): type the
  // example out and rank it once, so the payoff shows without a click. Any
  // touch stops it; reduced motion never sees it.
  useEffect(() => {
    if (!autoplay || reduce || !document.documentElement.classList.contains("rushd-intro") || window.location.hash) return;
    const el = rootRef.current;
    if (!el) return;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || touched.current) return;
        io.disconnect();
        let i = 0;
        setTyping(true);
        setText("");
        const tick = () => {
          if (touched.current) {
            setText(EXAMPLE);
            setTyping(false);
            return;
          }
          i = Math.min(EXAMPLE.length, i + 2);
          setText(EXAMPLE.slice(0, i));
          if (i < EXAMPLE.length) timer = window.setTimeout(tick, 16);
          else {
            setTyping(false);
            timer = window.setTimeout(() => {
              if (touched.current) return;
              // The demo isn't a visitor ranking their week; don't count it.
              counted.current = true;
              rank(EXAMPLE, false);
              setAutoRanked(true);
            }, 450);
          }
        };
        timer = window.setTimeout(tick, 900);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load
  }, [autoplay, reduce]);

  // Opened from a shared link: show that week, ranked for today.
  useEffect(() => {
    const m = window.location.hash.match(/^#w=([A-Za-z0-9_-]{1,4000})$/);
    if (!m) return;
    const shared = decodeWeek(m[1]);
    if (!shared) return;
    const id = window.setTimeout(() => {
      setText(shared);
      rank(shared, false);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load
  }, []);

  async function share() {
    const url = `${window.location.origin}/tools/rank-my-week#w=${encodeWeek(text)}`;
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: "My week, ranked by Rushd", url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      }
      countOnce("#try-share");
    } catch {
      // Cancelled or blocked; nothing to do.
    }
  }

  // Rows appear in the order typed, then settle into Pulse order while the
  // scores count up.
  useEffect(() => {
    if (!rows || reduce) return;
    const settle = window.setTimeout(() => setSettled(true), 380);
    const start = performance.now() + 380;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 900));
      setProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(raf);
    };
  }, [rows, reduce]);

  function save() {
    try {
      localStorage.setItem(TRY_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
    } catch {
      // Private mode: signup still works, the list just isn't carried over.
    }
    countOnce("#try-save");
    router.push("/signup?from=try");
  }

  const top = rows?.[0];
  const pick = rows?.[Math.min(selected, rows.length - 1)] ?? top;
  const partsMax = Math.max(1, ...(pick?.parts.map((p) => p.points) ?? [1]));
  const total = rows?.reduce((s, r) => s + r.minutes, 0) ?? 0;

  return (
    <div
      ref={rootRef}
      onPointerDown={() => (touched.current = true)}
      onKeyDown={() => (touched.current = true)}
      onFocusCapture={() => (touched.current = true)}
      className={cn("relative z-10 rounded-2xl border border-border bg-card shadow-[0_30px_80px_-40px_hsl(var(--shadow-tint)/0.55)]", compact ? "p-4" : "p-4 sm:p-5")}>
      <p className="sr-only" aria-live="polite">
        {rows && rows.length ? `Ranked ${rows.length} item${rows.length === 1 ? "" : "s"} by Pulse. Start with ${rows[0].title}.` : ""}
      </p>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
          {rows ? "Ranked by Pulse" : "Try it: rank your week"}
        </p>
        {rows && (
          <button
            type="button"
            onClick={() => {
              if (autoRanked) setText("");
              if (autoRanked) counted.current = false;
              setAutoRanked(false);
              setRows(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs hover:text-foreground",
              autoRanked ? "font-medium text-foreground underline underline-offset-4" : "text-muted-foreground",
            )}
          >
            {autoRanked ? (
              "Now type yours"
            ) : (
              <>
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Edit
              </>
            )}
          </button>
        )}
      </div>

      {!rows ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            rank();
          }}
        >
          <label htmlFor="try-week" className="sr-only">
            Your assignments and tests this week, one per line
          </label>
          <textarea
            id="try-week"
            ref={inputRef}
            value={text}
            onChange={(e) => {
              touched.current = true;
              countOnce("#try-start");
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                rank();
              }
            }}
            rows={6}
            readOnly={typing}
            maxLength={2400}
            spellCheck={false}
            className="block w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-[1.7] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/40"
            placeholder={"Bio: lab report Thursday 2h\nCalc quiz Friday"}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">One per line. Nothing you type leaves your browser.</p>
            <div className="flex items-center gap-2">
              {text === EXAMPLE && (
                <button
                  type="button"
                  onClick={() => {
                    setText("");
                    inputRef.current?.focus();
                  }}
                  className="h-9 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                className="group inline-flex h-9 items-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98]"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal transition-transform group-hover:scale-150" />
                Rank it
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div ref={resultsRef} tabIndex={-1} className="mt-3 outline-none">
          <ol className="relative" style={{ height: rows.length * ROW }} aria-label="Your week ranked by Pulse">
            {rows.map((r) => {
              const pos = settled ? r.rank : r.inputIndex;
              const first = settled && r.rank === 0;
              return (
                <li
                  key={r.key}
                  className={cn(
                    "absolute inset-x-0 flex h-[50px] items-center gap-3 rounded-lg border bg-background px-3",
                    first ? "border-signal/70" : selected === r.rank && settled ? "border-foreground/40" : "border-border",
                    "hover:border-foreground/30",
                    !reduce && "transition-[transform,border-color] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]",
                  )}
                  style={{ transform: `translateY(${pos * ROW}px)`, transitionDelay: reduce ? undefined : `${r.inputIndex * 40}ms`, zIndex: rows.length - r.rank }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(r.rank)}
                    aria-pressed={selected === r.rank}
                    aria-label={`${r.title}, Pulse ${r.pulse}. Show why.`}
                    className="flex h-full w-full min-w-0 items-center gap-3 text-left"
                  >
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.className} · {settled ? r.reason : "ranking…"}
                      {r.assumedDate && settled ? " (no day given)" : ""}
                    </span>
                  </span>
                  <span className="flex w-12 shrink-0 items-center justify-end gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 w-2 rounded-full",
                        r.pulse >= 70 ? "bg-signal" : r.pulse >= 40 ? "bg-foreground" : "border-[1.5px] border-foreground/45",
                        first && r.pulse >= 70 && "pulse-live",
                      )}
                    />
                    <span className="font-mono text-sm tabular-nums">{Math.max(1, Math.round(r.pulse * progress))}</span>
                  </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {top && pick && (
            <div className={cn("mt-4 rounded-xl bg-secondary/70 p-4", !reduce && "transition-opacity duration-500", settled ? "opacity-100" : "opacity-0")}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
                {pick.rank === 0 ? "Start here" : `Number ${pick.rank + 1} of ${rows.length}`}
              </p>
              <p className="mt-1 font-display text-xl font-medium leading-snug">{pick.title}</p>
              {pick.parts.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">What went into its Pulse of {pick.pulse}</p>
                  <ul className="mt-2 space-y-1.5">
                    {pick.parts.map((part) => (
                      <li key={part.label} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 text-xs">
                        <span>{part.label}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <span
                            className={cn("block h-full rounded-full", pick.rank === 0 ? "bg-signal" : "bg-foreground/70")}
                            style={{ width: `${Math.max(4, (part.points / partsMax) * 100)}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {rows.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Tap any item to see why it ranks where it does.</p>}
                </div>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                {fmtMinutes(total)} of work this week. Rushd would plan it around your free time and re-rank it every day.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={save}
                  className="group inline-flex h-10 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98]"
                >
                  Save my week, free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
                <button type="button" onClick={share} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {shared ? "Link copied" : "Share this ranking"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
