import { cn } from "@/lib/utils";

/** Loading indicator in the Rushd language: points drift into line and the
 * last one lights. Calm, looping, and static under reduced motion. */
export function PathLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5", className)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="path-loader-dot h-1.5 w-1.5 rounded-full bg-foreground/70" style={{ ["--i" as string]: i }} />
      ))}
      <span className="path-loader-dot h-2 w-2 rounded-full bg-signal" style={{ ["--i" as string]: 3 }} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
