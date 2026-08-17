import { Activity } from "lucide-react";
import type { HealthComponent } from "@/lib/health/build-health-score";
import { HelpfulWidget } from "@/components/helpful-widget";

function scoreLabel(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Strong", tone: "text-success" };
  if (score >= 60) return { label: "Steady", tone: "text-primary" };
  if (score >= 40) return { label: "Uneven", tone: "text-warning" };
  return { label: "Rough patch", tone: "text-destructive" };
}

export function HealthScoreCard({
  score,
  components,
}: {
  score: number;
  components: HealthComponent[];
}) {
  const { label, tone } = scoreLabel(score);

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center">
          <span className={`font-heading text-4xl font-semibold tabular-nums ${tone}`}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Academic health · <span className={tone}>{label}</span>
          </p>
          <ul className="mt-2 space-y-1">
            {components.map((c) => (
              <li key={c.key} className="text-sm text-muted-foreground">
                — {c.detail}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <HelpfulWidget feature="health_score" />
          </div>
        </div>
      </div>
    </div>
  );
}
