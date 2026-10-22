import { formatDuration } from "@/lib/format";

export function WorkloadBars({
  days,
}: {
  days: { key: string; label: string; letter: string; minutes: number }[];
}) {
  const max = Math.max(1, ...days.map((d) => d.minutes));

  return (
    <div className="flex items-end gap-2" role="img" aria-label="Planned study for the next 7 days">
      {days.map((d) => {
        const heightPct = Math.round((d.minutes / max) * 100);
        return (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end">
              <div
                className="w-full rounded-sm bg-brand/80"
                style={{ height: `${Math.max(4, heightPct)}%` }}
                title={`${d.label}: ${formatDuration(d.minutes)}`}
              />
            </div>
            <span className="text-xs text-muted-foreground">{d.letter}</span>
          </div>
        );
      })}
    </div>
  );
}
