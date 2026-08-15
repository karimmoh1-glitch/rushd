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
  type AbandonReasonValue,
  type CompletedSessionSummary,
} from "@/server/actions/study-sessions";

const ABANDON_REASONS: { value: AbandonReasonValue; label: string }[] = [
  { value: "RAN_OUT_OF_TIME", label: "Ran out of time" },
  { value: "HARDER_THAN_EXPECTED", label: "Harder than expected" },
  { value: "GOT_DISTRACTED", label: "Got distracted" },
  { value: "NEED_HELP", label: "Need help" },
  { value: "SOMETHING_CAME_UP", label: "Something came up" },
  { value: "OTHER", label: "Other" },
];

function elapsedParts(startedAt: string) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  return {
    minutes: Math.floor(totalSeconds / 60),
    label: (() => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    })(),
  };
}

/**
 * Persistent bar shown on every authenticated page while a study session is
 * running. Always mounted (never conditionally, based on activeSession) so
 * the post-completion summary dialog — local, independent state — survives
 * even the instant activeSession flips back to null.
 */
export function ActiveSessionBar() {
  const { activeSession, setActiveSession } = useActiveSession();
  const [, forceTick] = useState(0);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [actualMinutesInput, setActualMinutesInput] = useState("");
  const [reason, setReason] = useState<AbandonReasonValue | "">("");
  const [summary, setSummary] = useState<CompletedSessionSummary | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  function openComplete() {
    if (!activeSession) return;
    setActualMinutesInput(String(Math.max(1, elapsedParts(activeSession.startedAt).minutes || 1)));
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
      const result = await completeSession(activeSession.id, Math.round(minutes));
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

  const elapsed = activeSession ? elapsedParts(activeSession.startedAt) : null;

  return (
    <>
      {activeSession && (
        <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent/60 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{activeSession.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {activeSession.className} · Planned {formatDuration(activeSession.plannedMinutes)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-sm tabular-nums">{elapsed?.label}</span>
            <Button size="sm" onClick={openComplete} disabled={pending}>
              Complete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbandonOpen(true)} disabled={pending}>
              Abandon
            </Button>
          </div>
        </div>
      )}

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How long did this actually take?</DialogTitle>
            <DialogDescription>
              {activeSession &&
                `Rushd estimated ${formatDuration(activeSession.plannedMinutes)}. Elapsed time is pre-filled below — edit it if the tab was open longer than you actually worked.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="actual-minutes">You worked for (minutes)</Label>
            <Input
              id="actual-minutes"
              type="number"
              min={1}
              max={1000}
              value={actualMinutesInput}
              onChange={(e) => setActualMinutesInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={confirmComplete} disabled={pending}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={abandonOpen} onOpenChange={setAbandonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why did you stop?</DialogTitle>
            <DialogDescription>Totally optional — skip if you&apos;d rather not say.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as AbandonReasonValue)}>
            {ABANDON_REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={r.value} />
                {r.label}
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={confirmAbandon} disabled={pending}>
              Skip
            </Button>
            <Button onClick={confirmAbandon} disabled={pending}>
              {pending ? "Ending…" : "End session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summary !== null} onOpenChange={(open) => !open && setSummary(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Done</DialogTitle>
          </DialogHeader>
          {summary && (
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
                  {summary.actualMinutes - summary.plannedMinutes >= 0 ? "+" : ""}
                  {summary.actualMinutes - summary.plannedMinutes} min
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                That&apos;s useful data — Rushd will use it to improve future estimates.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSummary(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
