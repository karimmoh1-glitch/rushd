// Pure color math, kept apart from theme.ts so it can be unit tested without React Native.

/** A course color mixed into the card color, like the web's .course-tint (7%). */
export function tint(courseColor: string, base: string, amount = 0.07): string {
  const parse = (hex: string) => {
    const clean = hex.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
    return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  };
  const a = parse(courseColor);
  const b = parse(base);
  if (!a || !b) return base;
  const mixed = a.map((channel, i) => Math.round(channel * amount + b[i] * (1 - amount)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
