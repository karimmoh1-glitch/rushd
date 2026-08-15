export const PRIORITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
} as const;

export type PriorityValue = keyof typeof PRIORITY_LABELS;
