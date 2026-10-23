import { formatDuration } from "@/lib/format";

/** Bar height as a percent of the tallest day, with a small minimum so short days stay visible. */
function barHeight(minutes: number, max: number): string | number {
  if (minutes <= 0) return 0;
  const percent = Math.round((minutes / max) * 100);
  return `${Math.max(6, percent)}%`;
}

/** Short label under each bar, like "45m" or "1h 30m". */
function shortDuration(minutes: number): string {
  if (minutes <= 0) return "–";
  return formatDuration(minutes).replace(" min", "m");
}

/** Planned study per day for the coming week, against the time available. */
export function WorkloadBars({
  days,
}: {
  days: { key: string; label: string; letter: string; minutes: number; availableMinutes: number }[];
}) {
  // The scale is at least one hour, so a light week doesn't look full.
  const max = Math.max(60, ...days.map((day) => Math.max(day.minutes, day.availableMinutes)));

  return (
    <ol className="grid grid-cols-7 gap-2" aria-label="Planned study for the next 7 days">
      {days.map((day, index) => (
        <li key={day.key} className="flex flex-col items-center gap-1.5">
          <div className="relative flex h-20 w-full max-w-10 items-end rounded-md bg-muted/60" aria-hidden="true">
            <div
              className="w-full rounded-md bg-foreground/70"
              style={{ height: barHeight(day.minutes, max) }}
            />
          </div>
          <span aria-hidden="true" className={index === 0 ? "text-xs font-medium" : "text-xs text-muted-foreground"}>{day.letter}</span>
          <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {shortDuration(day.minutes)}
          </span>
          <span className="sr-only">
            {day.label}: {formatDuration(day.minutes)} planned
          </span>
        </li>
      ))}
    </ol>
  );
}
