import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Bar height as a percent of the tallest day, with a small minimum so short days stay visible. */
function barHeight(minutes: number, max: number): string | number {
  if (minutes <= 0) return 0;
  const percent = Math.round((minutes / max) * 100);
  return `${Math.max(6, percent)}%`;
}

/** Short label under each bar, like "45m" or "1h30", narrow enough for a phone. */
function shortDuration(minutes: number): string {
  if (minutes <= 0) return "–";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

/** Planned study per day for the coming week, drawn over the study time available that day. */
export function WorkloadBars({
  days,
}: {
  days: { key: string; label: string; letter: string; minutes: number; availableMinutes: number }[];
}) {
  // The scale is at least one hour, so a light week doesn't look full.
  const max = Math.max(60, ...days.map((day) => Math.max(day.minutes, day.availableMinutes)));

  return (
    <ol className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="Planned study for the next 7 days">
      {days.map((day, index) => {
        const isToday = index === 0;
        const overloaded = day.availableMinutes > 0 && day.minutes > day.availableMinutes;
        return (
          <li key={day.key} className="flex flex-col items-center gap-1.5">
            <div className="relative flex h-24 w-full max-w-9 items-end overflow-hidden rounded-md bg-muted/40" aria-hidden="true">
              <div className="absolute inset-x-0 bottom-0 bg-muted" style={{ height: barHeight(day.availableMinutes, max) }} />
              <div
                className={cn(
                  "relative w-full rounded-md",
                  overloaded ? "bg-overdue/80" : isToday ? "bg-signal" : "bg-foreground/55",
                )}
                style={{ height: barHeight(day.minutes, max) }}
              />
            </div>
            <span aria-hidden="true" className={isToday ? "text-xs font-semibold text-signal-ink" : "text-xs text-muted-foreground"}>
              {day.letter}
            </span>
            <span aria-hidden="true" className="font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
              {shortDuration(day.minutes)}
            </span>
            <span className="sr-only">
              {day.label}: {formatDuration(day.minutes)} planned of {formatDuration(day.availableMinutes)} available
              {overloaded ? ", more than you have time for" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
