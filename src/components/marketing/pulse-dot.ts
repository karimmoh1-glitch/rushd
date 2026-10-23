/** Tailwind classes for the small Pulse dot: hot, warm, or an outlined ring. */
export function pulseDotClass(pulse: number): string {
  if (pulse >= 70) return "bg-signal";
  if (pulse >= 40) return "bg-foreground";
  return "border-[1.5px] border-foreground/45";
}
