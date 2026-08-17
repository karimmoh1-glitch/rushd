import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { RISK_SUGGESTIONS } from "@/lib/planning";
import type { WeekForecast } from "@/lib/planning/forecast";
import { cn } from "@/lib/utils";

const RISK_LABEL: Record<WeekForecast["risk"], string> = {
  high: "High pressure",
  medium: "Getting busy",
  low: "On track",
  unknown: "No availability set",
};

const RISK_CLASS: Record<WeekForecast["risk"], string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-success",
  unknown: "text-muted-foreground",
};

export function ForecastSection({ weeks }: { weeks: WeekForecast[] }) {
  const overloaded = weeks.find((w) => w.risk === "high");

  return (
    <section>
      <h2 className="mb-1 font-heading text-lg font-semibold">Academic forecast</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        If you keep working at your current pace, here&apos;s what the next three weeks look like.
      </p>
      {overloaded && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          At your current pace, <span className="font-medium">{overloaded.label.toLowerCase()}</span> runs{" "}
          {formatDuration(overloaded.estimatedMinutes - overloaded.availableMinutes)} over your usual
          available time — start on the highest-priority items now to soften it.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {weeks.map((week) => (
          <Card key={week.label}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{week.label}</p>
                <span className={cn("text-xs font-medium", RISK_CLASS[week.risk])}>
                  {RISK_LABEL[week.risk]}
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold">
                {formatDuration(week.estimatedMinutes)}
              </p>
              <p className="text-xs text-muted-foreground">
                estimated
                {week.risk !== "unknown" && ` of ${formatDuration(week.availableMinutes)} available`}
              </p>

              {week.topItems.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {week.topItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-1.5 truncate text-xs">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.classColor }}
                      />
                      <span className="truncate text-muted-foreground">{item.title}</span>
                    </li>
                  ))}
                </ul>
              )}

              {RISK_SUGGESTIONS[week.risk].length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {RISK_SUGGESTIONS[week.risk].map((suggestion) => (
                    <li key={suggestion} className="text-xs text-muted-foreground">
                      · {suggestion}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
