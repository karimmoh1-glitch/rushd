import { cn } from "@/lib/utils";
import type { Streak } from "@/lib/streak/streak";

// The study streak drawn as the Rushd path: the last seven days as points on
// a line, today's point lit once something real gets done.
export function StreakPath({ streak }: { streak: Streak }) {
  const label =
    streak.current === 0
      ? "Start a streak today"
      : `${streak.current}-day streak`;
  const sub = streak.todayDone
    ? "Done for today."
    : streak.current > 0
      ? "Study anything today to keep it."
      : "Finish a session, a check, or an assignment.";
  return (
    <div className="flex items-center gap-4" aria-label={`${label}. ${sub}`} role="group">
      <div className="relative flex items-center gap-[10px]" aria-hidden="true">
        <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border" />
        {streak.week.map((d, i) => (
          <span
            key={i}
            className={cn(
              "relative h-2.5 w-2.5 rounded-full",
              d === "done" && (i === 6 ? "bg-signal" : "bg-foreground"),
              d === "rest" && "border-[1.5px] border-dashed border-foreground/60 bg-background",
              d === "missed" && "bg-foreground/15",
              d === "today" && "border-[1.5px] border-signal bg-background",
            )}
          />
        ))}
      </div>
      <div className="text-sm leading-tight">
        <p className="font-medium tabular-nums">{label}</p>
        <p className="text-xs text-muted-foreground">
          {sub}
          {streak.restDays > 0 ? ` ${streak.restDays} rest day${streak.restDays === 1 ? "" : "s"} saved.` : ""}
        </p>
      </div>
    </div>
  );
}
