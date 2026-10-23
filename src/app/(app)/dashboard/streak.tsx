import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import type { Streak } from "@/lib/streak/streak";
import { ShareStreak } from "./share-streak";

// The study streak drawn as the Rushd path: the last seven days as points on
// a line, today's point lit once something real gets done.
function streakLabel(streak: Streak): string {
  if (streak.current === 0) return "Start a streak today";
  return `${streak.current}-day streak`;
}

function streakHint(streak: Streak): string {
  if (streak.todayDone) return "Done for today.";
  if (streak.current > 0) return "Study anything today to keep it.";
  return "Finish a session, a check, or an assignment.";
}

export function StreakPath({ streak, shareUrl, studiedMinutes = 0 }: { streak: Streak; shareUrl?: string | null; studiedMinutes?: number }) {
  const label = streakLabel(streak);
  const sub = streakHint(streak);
  return (
    <div className="flex items-center gap-4" aria-label={`${label}. ${sub}`} role="group">
      <div className="relative flex items-center gap-[10px]" aria-hidden="true">
        <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border" />
        {streak.week.map((day, index) => (
          <span
            key={index}
            className={cn(
              "relative h-2.5 w-2.5 rounded-full",
              // The last dot is today, so a finished today is lit in the signal color.
              day === "done" && (index === 6 ? "bg-signal" : "bg-foreground"),
              day === "rest" && "border-[1.5px] border-dashed border-foreground/60 bg-background",
              day === "missed" && "bg-foreground/15",
              day === "today" && "border-[1.5px] border-signal bg-background",
            )}
          />
        ))}
      </div>
      <div className="text-sm leading-tight">
        <p className="flex items-center gap-3 font-medium tabular-nums">
          {label}
          {shareUrl && streak.current >= 2 && <ShareStreak url={shareUrl} streak={streak.current} />}
        </p>
        <p className="text-xs text-muted-foreground">
          {sub}
          {streak.restDays > 0 ? ` ${streak.restDays} rest day${streak.restDays === 1 ? "" : "s"} saved.` : ""}
          {studiedMinutes > 0 ? ` ${formatDuration(studiedMinutes)} studied in the last 7 days.` : ""}
        </p>
      </div>
    </div>
  );
}
