import { PULSE_LABEL, pulseLevel } from "@/lib/planning/pulse";
import { cn } from "@/lib/utils";

/** An item's Pulse (1-99): how strongly it needs you right now. The node is
 * lit saffron when it needs you now, solid ink when it's coming up, and open
 * when it's on track. */
export function PulseBadge({ pulse, className, showLabel = false }: { pulse: number; className?: string; showLabel?: boolean }) {
  const level = pulseLevel(pulse);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)} title={`Pulse ${pulse}: ${PULSE_LABEL[level]}`}>
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          level === "high" && "bg-signal shadow-[0_0_0_3px_color-mix(in_oklch,var(--signal)_25%,transparent)]",
          level === "rising" && "bg-foreground",
          level === "calm" && "border-[1.5px] border-foreground/45",
        )}
      />
      <span className="font-mono text-xs tabular-nums">
        <span className="sr-only">Pulse </span>
        {pulse}
      </span>
      {showLabel && <span className="text-xs text-muted-foreground">{PULSE_LABEL[level]}</span>}
    </span>
  );
}
