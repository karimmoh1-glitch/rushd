import { formatDuration } from "@/lib/format";
import { REASON_LABELS } from "@/lib/planning/constants";
import type { ReasonCode } from "@/lib/planning/types";
import { cn } from "@/lib/utils";

export interface DaySession {
  title: string;
  className: string;
  classColor: string;
  minutes: number;
  reasonCode: ReasonCode;
}

export function DayColumn({
  label,
  dateLabel,
  isToday,
  hasAvailability,
  sessions,
}: {
  label: string;
  dateLabel: string;
  isToday: boolean;
  hasAvailability: boolean;
  sessions: DaySession[];
}) {
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-lg border p-3",
        isToday ? "border-primary bg-accent/40" : "border-border",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <p className={cn("text-sm font-semibold", isToday && "text-primary")}>{label}</p>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </div>
        {totalMinutes > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDuration(totalMinutes)}
          </span>
        )}
      </div>

      {sessions.length > 0 ? (
        <div className="space-y-1.5">
          {sessions.map((s, i) => (
            <div
              key={i}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              title={REASON_LABELS[s.reasonCode]}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.classColor }}
                />
                <span className="truncate font-medium">{s.title}</span>
              </div>
              <p className="mt-0.5 truncate text-muted-foreground">
                {s.className} · {formatDuration(s.minutes)}
              </p>
            </div>
          ))}
        </div>
      ) : hasAvailability ? (
        <p className="text-xs text-muted-foreground">Free</p>
      ) : (
        <p className="text-xs text-muted-foreground">Unavailable</p>
      )}
    </div>
  );
}
