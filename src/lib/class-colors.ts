// A restrained, fixed palette rather than a free color picker — keeps every
// class list visually calm regardless of how many classes a student adds.
export const CLASS_COLORS = [
  { value: "#2563eb", name: "Blue" },
  { value: "#7c3aed", name: "Violet" },
  { value: "#0d9488", name: "Teal" },
  { value: "#c2410c", name: "Amber" },
  { value: "#be123c", name: "Rose" },
  { value: "#4d7c0f", name: "Olive" },
  { value: "#0369a1", name: "Sky" },
  { value: "#525252", name: "Slate" },
] as const;

export const DEFAULT_CLASS_COLOR = CLASS_COLORS[0].value;
