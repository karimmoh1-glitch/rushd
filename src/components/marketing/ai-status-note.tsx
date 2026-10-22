import { aiEnabled } from "@/lib/env";
import { cn } from "@/lib/utils";

// While the AI features are off on this server, say so wherever the page
// describes them. Disappears on its own once ANTHROPIC_API_KEY is set.
export function AiStatusNote({ className }: { className?: string }) {
  if (aiEnabled) return null;
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      <span className="font-medium text-foreground">Today:</span> ranking, planning, and Canvas sync work now. The AI tutor and
      practice checks aren&apos;t switched on yet.
    </p>
  );
}
