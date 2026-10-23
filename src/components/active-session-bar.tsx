"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatDuration } from "@/lib/format";
import { useActiveSession } from "@/components/active-session-context";
import {
  completeSession,
  abandonSession,
  type ActiveSessionData,
  type AbandonReasonValue,
  type CompletedSessionSummary,
  type PerceivedDifficultyValue,
} from "@/server/actions/study-sessions";

const ABANDON_REASONS: { value: AbandonReasonValue; label: string }[] = [
  { value: "RAN_OUT_OF_TIME", label: "Ran out of time" },
  { value: "HARDER_THAN_EXPECTED", label: "Harder than expected" },
  { value: "GOT_DISTRACTED", label: "Got distracted" },
  { value: "NEED_HELP", label: "Need help" },
  { value: "SOMETHING_CAME_UP", label: "Something came up" },
  { value: "OTHER", label: "Other" },
];

const PERCEIVED_DIFFICULTY_OPTIONS: { value: PerceivedDifficultyValue; label: string }[] = [
  { value: "EASIER", label: "Easier than expected" },
  { value: "AS_EXPECTED", label: "About as expected" },
  { value: "HARDER", label: "Harder than expected" },
];

// ---------- Plain helper functions ----------

function secondsSince(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

/** "05:07" under an hour, "1:05:07" after. */
function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function difficultyLabel(value: PerceivedDifficultyValue): string | undefined {
  return PERCEIVED_DIFFICULTY_OPTIONS.find((option) => option.value === value)?.label;
}

// ---------- Main component ----------

// Always mounted (not only while a session runs), so the summary dialog
// survives the moment activeSession goes back to null.
export function ActiveSessionBar() {
  const { activeSession, setActiveSession } = useActiveSession();
  // Bumped every second so the clock re-renders.
  const [, setTick] = useState(0);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [actualMinutesInput, setActualMinutesInput] = useState("");
  const [difficulty, setDifficulty] = useState<PerceivedDifficultyValue | "">("");
  const [reason, setReason] = useState<AbandonReasonValue | "">("");
  const [summary, setSummary] = useState<CompletedSessionSummary | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  function openComplete() {
    if (!activeSession) return;
    const elapsedMinutes = Math.floor(secondsSince(activeSession.startedAt) / 60);
    setActualMinutesInput(String(Math.max(1, elapsedMinutes || 1)));
    setDifficulty("");
    setCompleteOpen(true);
  }

  function confirmComplete() {
    if (!activeSession) return;
    const minutes = Number(actualMinutesInput);
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Enter a valid number of minutes.");
      return;
    }
    startTransition(async () => {
      const result = await completeSession(activeSession.id, Math.round(minutes), difficulty || undefined);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
      setCompleteOpen(false);
      setActiveSession(null);
    });
  }

  function confirmAbandon() {
    if (!activeSession) return;
    startTransition(async () => {
      const result = await abandonSession(activeSession.id, reason || undefined);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setAbandonOpen(false);
      setReason("");
      setActiveSession(null);
      toast.info("Session ended — no judgment. Start again whenever you're ready.");
    });
  }

  return (
    <>
      {activeSession && (
        <SessionBar
          session={activeSession}
          pending={pending}
          onComplete={openComplete}
          onAbandon={() => setAbandonOpen(true)}
        />
      )}

      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        session={activeSession}
        minutesInput={actualMinutesInput}
        onMinutesInputChange={setActualMinutesInput}
        difficulty={difficulty}
        onToggleDifficulty={(value) => setDifficulty((d) => (d === value ? "" : value))}
        pending={pending}
        onConfirm={confirmComplete}
      />

      <AbandonDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        reason={reason}
        onReasonChange={setReason}
        pending={pending}
        onConfirm={confirmAbandon}
      />

      <SummaryDialog summary={summary} onClose={() => setSummary(null)} />
    </>
  );
}

// ---------- Pieces ----------

function SessionBar({
  session,
  pending,
  onComplete,
  onAbandon,
}: {
  session: ActiveSessionData;
  pending: boolean;
  onComplete: () => void;
  onAbandon: () => void;
}) {
  const elapsedSeconds = secondsSince(session.startedAt);
  const clock = formatClock(elapsedSeconds);
  // How much of the planned time has passed, drawn as a hairline along the bottom.
  const progress = Math.min(1, elapsedSeconds / Math.max(60, session.plannedMinutes * 60));

  return (
    <div
      style={{ ["--course" as string]: session.classColor }}
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-card/90 px-4 py-2.5 shadow-(--shadow-card) backdrop-blur-md sm:-mx-6 sm:px-6 md:top-0 lg:-mx-8 lg:px-8"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="pulse-live h-2 w-2 shrink-0 rounded-full bg-signal" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="course-ink">{session.className}</span> · Planned {formatDuration(session.plannedMinutes)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* The clock is computed from the current time, so server and browser legitimately differ by a second. */}
        <span className="mr-1 font-mono text-sm tabular-nums" suppressHydrationWarning>
          {clock}
        </span>
        <Button size="sm" variant="signal" onClick={onComplete} disabled={pending}>
          Complete
        </Button>
        <Button size="sm" variant="ghost" onClick={onAbandon} disabled={pending}>
          Abandon
        </Button>
      </div>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px origin-left bg-signal/70" style={{ transform: `scaleX(${progress})` }} suppressHydrationWarning />
    </div>
  );
}

function CompleteDialog({
  open,
  onOpenChange,
  session,
  minutesInput,
  onMinutesInputChange,
  difficulty,
  onToggleDifficulty,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ActiveSessionData | null;
  minutesInput: string;
  onMinutesInputChange: (value: string) => void;
  difficulty: PerceivedDifficultyValue | "";
  onToggleDifficulty: (value: PerceivedDifficultyValue) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How long did this actually take?</DialogTitle>
          <DialogDescription>
            {session &&
              `Rushd estimated ${formatDuration(session.plannedMinutes)}. Elapsed time is pre-filled below — edit it if the tab was open longer than you actually worked.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="actual-minutes">You worked for (minutes)</Label>
          <Input
            id="actual-minutes"
            type="number"
            min={1}
            max={1000}
            value={minutesInput}
            onChange={(e) => onMinutesInputChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>How did it feel? (optional)</Label>
          <div className="flex gap-2">
            {PERCEIVED_DIFFICULTY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggleDifficulty(option.value)}
                className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                  difficulty === option.value
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AbandonDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: AbandonReasonValue | "";
  onReasonChange: (reason: AbandonReasonValue) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Why did you stop?</DialogTitle>
          <DialogDescription>Totally optional — skip if you&apos;d rather not say.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={(v) => onReasonChange(v as AbandonReasonValue)}>
          {ABANDON_REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={r.value} />
              {r.label}
            </label>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onConfirm} disabled={pending}>
            Skip
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Ending…" : "End session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryDialog({ summary, onClose }: { summary: CompletedSessionSummary | null; onClose: () => void }) {
  return (
    <Dialog open={summary !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DoneMark />
          <DialogTitle>Done</DialogTitle>
          {summary && <DialogDescription className="truncate">{summary.title}</DialogDescription>}
        </DialogHeader>
        {summary && <SummaryDetails summary={summary} />}
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The path drawn to its end and the saffron node lit: a finished session. Still under reduced motion. */
function DoneMark() {
  return (
    <svg viewBox="0 0 32 32" className="mb-1 h-10 w-10 overflow-visible text-foreground" aria-hidden="true">
      <path
        className="done-line"
        d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        pathLength={1}
      />
      <circle className="done-node" cx="25.5" cy="8.5" r="3.8" fill="var(--signal)" />
    </svg>
  );
}

function SummaryDetails({ summary }: { summary: CompletedSessionSummary }) {
  const difference = summary.actualMinutes - summary.plannedMinutes;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Rushd estimated</span>
        <span className="font-medium">{formatDuration(summary.plannedMinutes)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Actual</span>
        <span className="font-medium">{formatDuration(summary.actualMinutes)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Difference</span>
        <span className="font-medium">
          {difference >= 0 ? "+" : ""}
          {difference} min
        </span>
      </div>
      {summary.perceivedDifficulty && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Felt like</span>
          <span className="font-medium">{difficultyLabel(summary.perceivedDifficulty)}</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        That&apos;s useful data — Rushd will use it to improve future estimates.
      </p>
    </div>
  );
}
