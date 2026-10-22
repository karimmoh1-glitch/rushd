import { cn } from "@/lib/utils";

// Fixed scatter so server and client render identically.
const POINTS = [
  [14, 30], [38, 12], [60, 40], [84, 18], [104, 46], [128, 22], [150, 38], [26, 52], [118, 6],
];

/**
 * Empty states: scattered points that haven't formed a path yet, with one
 * lit node where the student's first step will go.
 */
export function PathEmpty({
  title,
  children,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-8", className)}>
      <svg viewBox="0 0 170 60" className="h-12 w-auto text-foreground" aria-hidden="true">
        {POINTS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="currentColor" opacity={0.18 + (i % 3) * 0.08} />
        ))}
        <circle cx="160" cy="14" r="4" fill="var(--signal)" />
      </svg>
      <p className="mt-4 font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** For errors and missing pages: a path that breaks off before its node. */
export function BrokenPath({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 40" className={cn("h-10 w-auto text-foreground", className)} aria-hidden="true">
      <path d="M6 30C20 28 30 22 44 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M62 17C74 15 84 11 96 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 5" opacity="0.5" />
      <circle cx="6" cy="30" r="2.4" fill="currentColor" />
      <circle cx="26" cy="26" r="2.4" fill="currentColor" />
      <circle cx="44" cy="20" r="2.4" fill="currentColor" />
      <circle cx="108" cy="7" r="4.5" fill="var(--signal)" />
    </svg>
  );
}
