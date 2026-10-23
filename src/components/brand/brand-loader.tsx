import { cn } from "@/lib/utils";

/**
 * Rushd's signature loading moment: the three dots of the shīn (ش) in رُشد
 * gather, settle onto the rising path, and the saffron node lights: finding
 * the right path. Pure CSS (transform/opacity only). It stays invisible for
 * the first 350ms, so a fast load never flashes it. Reduced motion: a still
 * mark with a softly breathing node.
 */
export function BrandLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  const dots = [
    { cx: 5, cy: 24.5, tx: "8px", ty: "-11px" },
    { cx: 11, cy: 20, tx: "5px", ty: "-3px" },
    { cx: 17, cy: 16.5, tx: "-4px", ty: "-5px" },
  ];
  return (
    <div role="status" aria-label={label} className={cn("brand-loader flex flex-col items-center gap-3", className)}>
      <svg viewBox="0 0 32 32" className="h-12 w-12 overflow-visible text-foreground" aria-hidden="true">
        <path
          className="bl-line"
          d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          pathLength={1}
        />
        {dots.map((dot, index) => (
          <circle
            key={index}
            className="bl-dot"
            cx={dot.cx}
            cy={dot.cy}
            r="2.3"
            fill="currentColor"
            style={{ ["--i" as string]: index, ["--tx" as string]: dot.tx, ["--ty" as string]: dot.ty }}
          />
        ))}
        <circle className="bl-node" cx="25.5" cy="8.5" r="3.8" fill="var(--signal)" />
      </svg>
      <span lang="ar" dir="rtl" aria-hidden="true" className="bl-word font-arabic text-lg font-bold leading-none text-muted-foreground">
        رُشد
      </span>
    </div>
  );
}
