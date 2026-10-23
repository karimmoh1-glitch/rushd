"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseWeek, toWorkItems, TRY_STORAGE_KEY, type TryItem } from "@/lib/try/parse-week";
import { scoreAndRank } from "@/lib/planning/score";
import { explainScore } from "@/lib/planning/explain";
import { pulseOf } from "@/lib/planning/pulse";
import { countOnce } from "@/lib/analytics/beacon";
import { SCORING_WEIGHTS } from "@/lib/planning/constants";
import type { ScoreBreakdown } from "@/lib/planning/types";
import { usePrefersReducedMotion } from "./hooks";
import { pulseDotClass } from "./pulse-dot";

// Type your week and the real planner ranks it by Pulse, right in the browser.
// Privacy: nothing typed is sent anywhere; the only network calls are anonymous step counts.

const EXAMPLE = `Chem: lab report Thursday 2h
Calc quiz Friday
English essay draft Monday 3h
Spanish vocab worksheet tomorrow
History reading notes Wednesday 40m`;

const MAX_LENGTH = 2400;
const ROW_HEIGHT = 58;

interface ScorePart {
  label: string;
  points: number;
}

interface RankedItem {
  key: string;
  title: string;
  className: string;
  color: string;
  /** Position in the list as typed. */
  inputIndex: number;
  /** Position after ranking (0 = do this first). */
  rank: number;
  pulse: number;
  reason: string;
  assumedDate: boolean;
  minutes: number;
  /** What went into the score, from the planner's own breakdown. */
  parts: ScorePart[];
}

// ---------- Plain helper functions ----------

// Shared weeks travel in the URL hash, which browsers never send to a server.
function encodeWeek(text: string): string {
  const bytes = new TextEncoder().encode(text.slice(0, MAX_LENGTH));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeWeek(code: string): string | null {
  try {
    const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes).slice(0, MAX_LENGTH);
  } catch {
    return null;
  }
}

/** Reads a shared week from a "#w=..." link, if the page was opened from one. */
function readSharedWeekFromHash(): string | null {
  const match = window.location.hash.match(/^#w=([A-Za-z0-9_-]{1,4000})$/);
  if (!match) return null;
  return decodeWeek(match[1]);
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** The parts of the score worth showing, biggest first. */
function scoreParts(breakdown: ScoreBreakdown): ScorePart[] {
  const parts: ScorePart[] = [
    { label: "How soon it's due", points: breakdown.urgency },
    { label: "Test coming up", points: breakdown.examProximity },
    { label: "Already late", points: breakdown.overdue },
    { label: "Priority", points: breakdown.importance },
    { label: "Quick win", points: breakdown.effortTiebreak * SCORING_WEIGHTS.effortTiebreakWeight },
  ];
  return parts.filter((part) => part.points >= 0.5).sort((a, b) => b.points - a.points);
}

/** Runs the real planner on the parsed lines and returns them in Pulse order. */
function rankItems(parsed: TryItem[], now: Date, timeZone: string): RankedItem[] {
  const scored = scoreAndRank(toWorkItems(parsed), now, timeZone);
  return scored.map((entry, rank) => {
    // Item ids look like "try-3", where 3 is the line number as typed.
    const inputIndex = Number(entry.item.id.slice(4));
    return {
      key: `${entry.item.id}-${entry.item.title}`,
      title: entry.item.title,
      className: entry.item.className,
      color: entry.item.classColor,
      inputIndex,
      rank,
      pulse: pulseOf(entry.score),
      reason: explainScore(entry, now, scored, timeZone)[0] ?? entry.item.className,
      assumedDate: parsed[inputIndex].assumedDate,
      minutes: entry.item.remainingMinutes,
      parts: scoreParts(entry.breakdown),
    };
  });
}

/** What the screen reader hears once the list is ranked. */
function rankingSummary(rows: RankedItem[] | null): string {
  if (!rows || rows.length === 0) return "";
  const plural = rows.length === 1 ? "" : "s";
  return `Ranked ${rows.length} item${plural} by Pulse. Start with ${rows[0].title}.`;
}

function rowBorderClass(isFirst: boolean, isSelected: boolean): string {
  if (isFirst) return "border-signal/70";
  if (isSelected) return "border-foreground/40";
  return "border-border";
}

/** Ease-out cubic: fast at the start, gentle at the end. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ---------- Main component ----------

export function RankMyWeek({ compact = false, autoplay = false }: { compact?: boolean; autoplay?: boolean }) {
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const [text, setText] = useState(EXAMPLE);
  const [items, setItems] = useState<TryItem[] | null>(null);
  const [rows, setRows] = useState<RankedItem[] | null>(null);
  // Rows first appear in typed order; "settled" moves them into Pulse order.
  const [settled, setSettled] = useState(false);
  // 0 to 1 while the Pulse numbers count up.
  const [countUpProgress, setCountUpProgress] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isAutoTyping, setIsAutoTyping] = useState(false);
  const [wasAutoRanked, setWasAutoRanked] = useState(false);
  const [selectedRank, setSelectedRank] = useState(0);
  const alreadyCounted = useRef(false);
  const userTouched = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function rank(source = text, fromUser = true) {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parsed = parseWeek(source, now);
    if (parsed.length === 0) {
      inputRef.current?.focus();
      return;
    }
    setItems(parsed);
    setRows(rankItems(parsed, now, timeZone));
    setSelectedRank(0);
    setSettled(reduceMotion);
    setCountUpProgress(reduceMotion ? 1 : 0);
    if (!alreadyCounted.current) {
      alreadyCounted.current = true;
      countOnce("#try");
    }
    // The form is replaced by the results: keep keyboard and screen-reader users with it.
    if (fromUser) requestAnimationFrame(() => resultsRef.current?.focus());
  }

  // First homepage visit (brand intro playing): type the example out and rank it once.
  // Any touch stops it; reduced motion never sees it.
  useEffect(() => {
    if (!autoplay || reduceMotion) return;
    if (!document.documentElement.classList.contains("rushd-intro")) return;
    if (window.location.hash) return;
    const root = rootRef.current;
    if (!root) return;

    let timer = 0;
    let typedLength = 0;

    function typeNextCharacters() {
      if (userTouched.current) {
        setText(EXAMPLE);
        setIsAutoTyping(false);
        return;
      }
      typedLength = Math.min(EXAMPLE.length, typedLength + 2);
      setText(EXAMPLE.slice(0, typedLength));
      if (typedLength < EXAMPLE.length) {
        timer = window.setTimeout(typeNextCharacters, 16);
      } else {
        setIsAutoTyping(false);
        timer = window.setTimeout(rankTheExample, 450);
      }
    }

    function rankTheExample() {
      if (userTouched.current) return;
      // The demo isn't a visitor ranking their week; don't count it.
      alreadyCounted.current = true;
      rank(EXAMPLE, false);
      setWasAutoRanked(true);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || userTouched.current) return;
        observer.disconnect();
        setIsAutoTyping(true);
        setText("");
        timer = window.setTimeout(typeNextCharacters, 900);
      },
      { threshold: 0.6 },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on load; rank() is intentionally not a dependency
  }, [autoplay, reduceMotion]);

  // Opened from a shared link: show that week, ranked for today.
  useEffect(() => {
    const sharedWeek = readSharedWeekFromHash();
    if (!sharedWeek) return;
    const timer = window.setTimeout(() => {
      setText(sharedWeek);
      rank(sharedWeek, false);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on load
  }, []);

  // After 380ms the rows slide into Pulse order while the scores count up for 900ms.
  useEffect(() => {
    if (!rows || reduceMotion) return;
    const settleTimer = window.setTimeout(() => setSettled(true), 380);
    const startTime = performance.now() + 380;
    let frame = 0;

    function step(time: number) {
      const t = Math.min(1, Math.max(0, (time - startTime) / 900));
      setCountUpProgress(easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(step);
    }

    frame = requestAnimationFrame(step);
    return () => {
      window.clearTimeout(settleTimer);
      cancelAnimationFrame(frame);
    };
  }, [rows, reduceMotion]);

  async function share() {
    const url = `${window.location.origin}/tools/rank-my-week#w=${encodeWeek(text)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "My week, ranked by Rushd", url });
      } else {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1800);
      }
      countOnce("#try-share");
    } catch {
      // Cancelled or blocked; nothing to do.
    }
  }

  function save() {
    try {
      localStorage.setItem(TRY_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
    } catch {
      // Private mode: signup still works, the list just isn't carried over.
    }
    countOnce("#try-save");
    router.push("/signup?from=try");
  }

  function backToEditing() {
    // After the autoplay demo, start from an empty box and count the visitor's own ranking.
    if (wasAutoRanked) {
      setText("");
      alreadyCounted.current = false;
    }
    setWasAutoRanked(false);
    setRows(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function markTouched() {
    userTouched.current = true;
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={markTouched}
      onKeyDown={markTouched}
      onFocusCapture={markTouched}
      className={cn("relative z-10 rounded-2xl border border-border bg-card shadow-[0_30px_80px_-40px_hsl(var(--shadow-tint)/0.55)]", compact ? "p-4" : "p-4 sm:p-5")}>
      <p className="sr-only" aria-live="polite">
        {rankingSummary(rows)}
      </p>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
          {rows ? "Ranked by Pulse" : "Try it: rank your week"}
        </p>
        {rows && <EditButton wasAutoRanked={wasAutoRanked} onClick={backToEditing} />}
      </div>

      {!rows ? (
        <WeekForm
          text={text}
          isAutoTyping={isAutoTyping}
          inputRef={inputRef}
          onTextChange={(value) => {
            userTouched.current = true;
            countOnce("#try-start");
            setText(value);
          }}
          onClear={() => {
            setText("");
            inputRef.current?.focus();
          }}
          onRank={() => rank()}
        />
      ) : (
        <div ref={resultsRef} tabIndex={-1} className="mt-3 outline-none">
          <RankedList
            rows={rows}
            settled={settled}
            selectedRank={selectedRank}
            reduceMotion={reduceMotion}
            countUpProgress={countUpProgress}
            onSelect={setSelectedRank}
          />
          <WhyPanel
            rows={rows}
            selectedRank={selectedRank}
            settled={settled}
            reduceMotion={reduceMotion}
            linkCopied={linkCopied}
            onSave={save}
            onShare={share}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Pieces ----------

function EditButton({ wasAutoRanked, onClick }: { wasAutoRanked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs hover:text-foreground",
        wasAutoRanked ? "font-medium text-foreground underline underline-offset-4" : "text-muted-foreground",
      )}
    >
      {wasAutoRanked ? (
        "Now type yours"
      ) : (
        <>
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Edit
        </>
      )}
    </button>
  );
}

function WeekForm({
  text,
  isAutoTyping,
  inputRef,
  onTextChange,
  onClear,
  onRank,
}: {
  text: string;
  isAutoTyping: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onTextChange: (value: string) => void;
  onClear: () => void;
  onRank: () => void;
}) {
  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onRank();
      }}
    >
      <label htmlFor="try-week" className="sr-only">
        Your assignments and tests this week, one per line
      </label>
      <textarea
        id="try-week"
        ref={inputRef}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          // Cmd+Enter or Ctrl+Enter ranks without leaving the keyboard.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onRank();
          }
        }}
        rows={6}
        readOnly={isAutoTyping}
        maxLength={MAX_LENGTH}
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
              onClick={onClear}
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
  );
}

function RankedList({
  rows,
  settled,
  selectedRank,
  reduceMotion,
  countUpProgress,
  onSelect,
}: {
  rows: RankedItem[];
  settled: boolean;
  selectedRank: number;
  reduceMotion: boolean;
  countUpProgress: number;
  onSelect: (rank: number) => void;
}) {
  return (
    <ol className="relative" style={{ height: rows.length * ROW_HEIGHT }} aria-label="Your week ranked by Pulse">
      {rows.map((row) => (
        <RankedRow
          key={row.key}
          row={row}
          rowCount={rows.length}
          settled={settled}
          isSelected={selectedRank === row.rank}
          reduceMotion={reduceMotion}
          countUpProgress={countUpProgress}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}

function RankedRow({
  row,
  rowCount,
  settled,
  isSelected,
  reduceMotion,
  countUpProgress,
  onSelect,
}: {
  row: RankedItem;
  rowCount: number;
  settled: boolean;
  isSelected: boolean;
  reduceMotion: boolean;
  countUpProgress: number;
  onSelect: (rank: number) => void;
}) {
  const position = settled ? row.rank : row.inputIndex;
  const isFirst = settled && row.rank === 0;
  const shownPulse = Math.max(1, Math.round(row.pulse * countUpProgress));

  return (
    <li
      className={cn(
        "absolute inset-x-0 flex h-[50px] items-center gap-3 rounded-lg border bg-background px-3",
        rowBorderClass(isFirst, isSelected && settled),
        "hover:border-foreground/30",
        !reduceMotion && "transition-[transform,border-color] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]",
      )}
      style={{
        transform: `translateY(${position * ROW_HEIGHT}px)`,
        // Rows move one after another, in the order they were typed.
        transitionDelay: reduceMotion ? undefined : `${row.inputIndex * 40}ms`,
        zIndex: rowCount - row.rank,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(row.rank)}
        aria-pressed={isSelected}
        aria-label={`${row.title}, Pulse ${row.pulse}. Show why.`}
        className="flex h-full w-full min-w-0 items-center gap-3 text-left"
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{row.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.className} · {settled ? row.reason : "ranking…"}
            {row.assumedDate && settled ? " (no day given)" : ""}
          </span>
        </span>
        <span className="flex w-12 shrink-0 items-center justify-end gap-1.5">
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 rounded-full", pulseDotClass(row.pulse), isFirst && row.pulse >= 70 && "pulse-live")}
          />
          <span className="font-mono text-sm tabular-nums">{shownPulse}</span>
        </span>
      </button>
    </li>
  );
}

/** The "why this score" card under the list, plus the save and share buttons. */
function WhyPanel({
  rows,
  selectedRank,
  settled,
  reduceMotion,
  linkCopied,
  onSave,
  onShare,
}: {
  rows: RankedItem[];
  selectedRank: number;
  settled: boolean;
  reduceMotion: boolean;
  linkCopied: boolean;
  onSave: () => void;
  onShare: () => void;
}) {
  const picked = rows[Math.min(selectedRank, rows.length - 1)] ?? rows[0];
  if (!picked) return null;

  const biggestPart = Math.max(1, ...picked.parts.map((part) => part.points));
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const heading = picked.rank === 0 ? "Start here" : `Number ${picked.rank + 1} of ${rows.length}`;

  return (
    <div className={cn("mt-4 rounded-xl bg-secondary/70 p-4", !reduceMotion && "transition-opacity duration-500", settled ? "opacity-100" : "opacity-0")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">{heading}</p>
      <p className="mt-1 font-display text-xl font-medium leading-snug">{picked.title}</p>
      {picked.parts.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">What went into its Pulse of {picked.pulse}</p>
          <ul className="mt-2 space-y-1.5">
            {picked.parts.map((part) => (
              <li key={part.label} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 text-xs">
                <span>{part.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className={cn("block h-full rounded-full", picked.rank === 0 ? "bg-signal" : "bg-foreground/70")}
                    style={{ width: `${Math.max(4, (part.points / biggestPart) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Tap any item to see why it ranks where it does.</p>}
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {formatMinutes(totalMinutes)} of work this week. Rushd would plan it around your free time and re-rank it every day.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onSave}
          className="group inline-flex h-10 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98]"
        >
          Save my week, free
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
        <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {linkCopied ? "Link copied" : "Share this ranking"}
        </button>
      </div>
    </div>
  );
}
