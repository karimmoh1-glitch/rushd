// Small glyphs in the Rushd path language, one per benefit.

export function GlyphContext() {
  // Scattered points gathering onto a line: your coursework as context.
  return (
    <svg viewBox="0 0 64 28" className="h-7 w-16 text-foreground" aria-hidden="true">
      <circle cx="6" cy="6" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="16" cy="22" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="12" cy="13" r="2" fill="currentColor" opacity="0.45" />
      <path d="M24 14H58" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="30" cy="14" r="2.2" fill="currentColor" />
      <circle cx="42" cy="14" r="2.2" fill="currentColor" />
      <circle cx="54" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function GlyphGap() {
  // A path with one open node: what you don't understand yet.
  return (
    <svg viewBox="0 0 64 28" className="h-7 w-16 text-foreground" aria-hidden="true">
      <path d="M6 14H58" stroke="currentColor" strokeWidth="1.3" strokeDasharray="0" />
      <circle cx="8" cy="14" r="2.2" fill="currentColor" />
      <circle cx="22" cy="14" r="2.2" fill="currentColor" />
      <circle cx="38" cy="14" r="4.5" fill="var(--background)" stroke="var(--signal)" strokeWidth="2" />
      <circle cx="54" cy="14" r="2.2" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export function GlyphNext() {
  // A rising path ending in the lit node: what to study next.
  return (
    <svg viewBox="0 0 64 28" className="h-7 w-16 text-foreground" aria-hidden="true">
      <path d="M6 22C16 20 22 15 32 14S46 8 54 6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="22" r="2.2" fill="currentColor" />
      <circle cx="19" cy="18.5" r="2.2" fill="currentColor" />
      <circle cx="32" cy="14" r="2.2" fill="currentColor" />
      <circle cx="54" cy="6" r="4" fill="var(--signal)" />
    </svg>
  );
}
