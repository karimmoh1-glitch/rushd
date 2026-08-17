"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
// Imports directly from ./forecast rather than the @/lib/planning barrel —
// that barrel also re-exports build-work-items.ts, which pulls in
// "server-only" and would poison this client component's bundle.
import { riskFor, type RiskLevel } from "@/lib/planning/forecast";

const RISK_LABEL: Record<RiskLevel, string> = {
  high: "High pressure",
  medium: "Getting busier",
  low: "On track",
  unknown: "No availability set",
};

const RISK_TONE: Record<RiskLevel, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-success",
  unknown: "text-muted-foreground",
};

/**
 * A real simulation, not a guess: re-runs the exact same estimated/available
 * comparison the Forecast section uses (src/lib/planning/forecast.ts's
 * riskFor), just with today's planned minutes subtracted from this week's
 * available time — the honest arithmetic consequence of not studying today.
 * Pure client-side math on server-computed numbers; no extra request, no AI.
 */
export function WhatIfSimulator({
  todayMinutes,
  thisWeekEstimated,
  thisWeekAvailable,
}: {
  todayMinutes: number;
  thisWeekEstimated: number;
  thisWeekAvailable: number;
}) {
  const [shown, setShown] = useState(false);

  if (todayMinutes <= 0) return null;

  const currentRisk = riskFor(thisWeekEstimated, thisWeekAvailable);
  const simulatedAvailable = Math.max(0, thisWeekAvailable - todayMinutes);
  const simulatedRisk = riskFor(thisWeekEstimated, simulatedAvailable);
  const riskWorsens =
    (currentRisk === "low" && simulatedRisk !== "low") ||
    (currentRisk === "medium" && simulatedRisk === "high");

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          What if I skip today?
        </p>
        <Button variant="outline" size="sm" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "See what happens"}
        </Button>
      </div>
      {shown && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-muted-foreground">
            Skipping today pushes {formatDuration(todayMinutes)} of planned work onto the rest of
            the week, leaving {formatDuration(simulatedAvailable)} of your usual{" "}
            {formatDuration(thisWeekAvailable)} available for the same {formatDuration(thisWeekEstimated)}{" "}
            of estimated work.
          </p>
          <div className="flex items-center gap-4 rounded-md bg-muted/40 px-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">If you study today</p>
              <p className={`font-medium ${RISK_TONE[currentRisk]}`}>{RISK_LABEL[currentRisk]}</p>
            </div>
            <div className="text-muted-foreground">→</div>
            <div>
              <p className="text-xs text-muted-foreground">If you skip today</p>
              <p className={`font-medium ${RISK_TONE[simulatedRisk]}`}>{RISK_LABEL[simulatedRisk]}</p>
            </div>
          </div>
          {riskWorsens && (
            <p className="text-xs text-warning">
              Skipping today measurably raises this week&apos;s risk — worth doing even a short
              session.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
