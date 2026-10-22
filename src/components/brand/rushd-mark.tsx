import { cn } from "@/lib/utils";

/**
 * The Rushd mark. Its three points are the three dots of the shīn (ش) in
 * رُشد, settled onto one rising path that ends in a lit node: the next step.
 * Ink follows currentColor; the node is always the signature saffron.
 * On a first visit (.rushd-intro) the points start in the shīn's triangle.
 */
export function RushdMark({ className, title }: { className?: string; title?: string }) {
  const dots = [
    { cx: 5, cy: 24.5, tx: "8px", ty: "-11px" },
    { cx: 11, cy: 20, tx: "5px", ty: "-3px" },
    { cx: 17, cy: 16.5, tx: "-4px", ty: "-5px" },
  ];
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6 overflow-visible", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path className="mark-line" d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {dots.map((d, i) => (
        <circle
          key={i}
          className="mark-dot"
          cx={d.cx}
          cy={d.cy}
          r="2.3"
          fill="currentColor"
          style={{ ["--i" as string]: i, ["--tx" as string]: d.tx, ["--ty" as string]: d.ty }}
        />
      ))}
      <circle className="mark-node" cx="25.5" cy="8.5" r="3.8" fill="var(--signal)" />
    </svg>
  );
}

/** The full signature: mark, Latin wordmark, and the Arabic رُشد. */
export function RushdLogo({ className, arabic = true }: { className?: string; arabic?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RushdMark className="h-7 w-7" />
      <span className="font-display text-[1.4rem] font-medium leading-none tracking-[-0.01em]">Rushd</span>
      {arabic && (
        <>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          <span lang="ar" dir="rtl" className="font-arabic text-[1.35rem] font-bold leading-none" aria-label="Rushd in Arabic">
            رُشد
          </span>
        </>
      )}
    </span>
  );
}

/** Compact form for tight spaces (app sidebar, phone header). */
export function RushdWordmark({ className }: { className?: string }) {
  return <RushdLogo className={className} />;
}
