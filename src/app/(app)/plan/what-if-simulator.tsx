"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { logWhatIfSimulatorUsed } from "@/server/actions/feature-events";
import { HelpfulWidget } from "@/components/helpful-widget";
// Import from ./forecast directly: the @/lib/planning barrel pulls in
// server-only code that can't go into a client bundle.
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

/** Re-runs the Forecast's risk check (riskFor) with today's planned minutes taken
 * out of this week's available time. Plain math in the browser; no request, no AI. */
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
  let riskWorsens = false;
  if (currentRisk === "low" && simulatedRisk !== "low") riskWorsens = true;
  if (currentRisk === "medium" && simulatedRisk === "high") riskWorsens = true;

  function toggle() {
    // Count the feature as used the first time it's opened.
    if (!shown) void logWhatIfSimulatorUsed();
    setShown((isShown) => !isShown);
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          What if I skip today?
        </p>
        <Button variant="outline" size="sm" onClick={toggle}>
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
          <HelpfulWidget feature="what_if" />
        </div>
      )}
    </div>
  );
}
