import { formatDuration } from "@/lib/format";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function WorkloadBars({
  days,
}: {
  days: { date: Date; minutes: number }[];
}) {
  const max = Math.max(1, ...days.map((d) => d.minutes));

  return (
    <div className="flex items-end gap-2" role="img" aria-label="Workload distribution for the next 7 days">
      {days.map((d, i) => {
        const heightPct = Math.round((d.minutes / max) * 100);
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end">
              <div
                className="w-full rounded-sm bg-primary/70"
                style={{ height: `${Math.max(4, heightPct)}%` }}
                title={`${d.date.toLocaleDateString(undefined, { weekday: "short" })}: ${formatDuration(d.minutes)}`}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {DAY_LETTERS[d.date.getDay()]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
