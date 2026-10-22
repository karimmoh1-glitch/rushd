import { cn } from "@/lib/utils";

/** Fades content in as it scrolls into view, using CSS scroll-driven
 * animations as a progressive enhancement. Content is fully visible by
 * default: without JS, in browsers without `animation-timeline`, or with
 * reduced motion, it simply renders. Marketing pages only; app screens
 * should never hide content behind an entrance effect. */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  /** Layout classes for the wrapper itself (e.g. grid column spans). */
  className?: string;
}) {
  return <div className={cn("reveal", className)}>{children}</div>;
}
