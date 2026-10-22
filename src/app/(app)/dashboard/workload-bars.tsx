import { formatDuration } from "@/lib/format";

/** Planned study per day for the coming week, against the time available. */
export function WorkloadBars({
  days,
}: {
  days: { key: string; label: string; letter: string; minutes: number; availableMinutes: number }[];
}) {
  const max = Math.max(60, ...days.map((d) => Math.max(d.minutes, d.availableMinutes)));

  return (
    <ol className="grid grid-cols-7 gap-2" aria-label="Planned study for the next 7 days">
      {days.map((d, i) => (
        <li key={d.key} className="flex flex-col items-center gap-1.5">
          <div className="relative flex h-20 w-full max-w-10 items-end rounded-md bg-muted/60" aria-hidden="true">
            <div
              className="w-full rounded-md bg-foreground/70"
              style={{ height: d.minutes > 0 ? `${Math.max(6, Math.round((d.minutes / max) * 100))}%` : 0 }}
            />
          </div>
          <span aria-hidden="true" className={i === 0 ? "text-xs font-medium" : "text-xs text-muted-foreground"}>{d.letter}</span>
          <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {d.minutes > 0 ? formatDuration(d.minutes).replace(" min", "m") : "–"}
          </span>
          <span className="sr-only">
            {d.label}: {formatDuration(d.minutes)} planned
          </span>
        </li>
      ))}
    </ol>
  );
}
