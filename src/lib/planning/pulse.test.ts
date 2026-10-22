import { describe, it, expect } from "vitest";
import { pulseLevel, pulseOf } from "./pulse";
import { scoreItem } from "./score";
import type { WorkItem } from "./types";

const NOW = new Date("2026-10-22T16:00:00Z");
const item = (days: number, priority: WorkItem["priority"] = "MEDIUM", kind: WorkItem["kind"] = "assignment"): WorkItem => ({
  id: `${kind}-${days}-${priority}`,
  kind,
  title: "x",
  className: "Chem",
  classId: "c1",
  estimateAdjusted: false,
  classColor: "#000",
  dueAt: new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000),
  priority,
  classPriority: "MEDIUM",
  rawEstimatedMinutes: 60,
  remainingMinutes: 60,
});
const pulse = (w: WorkItem) => pulseOf(scoreItem(w, NOW, "UTC").score);

describe("pulse", () => {
  it("stays within 1-99 and handles degenerate scores", () => {
    expect(pulseOf(-5)).toBe(1);
    expect(pulseOf(NaN)).toBe(1);
    expect(pulseOf(10_000)).toBe(99);
  });

  it("orders like the engine: overdue > today > next week", () => {
    const overdue = pulse(item(-3, "HIGH"));
    const today = pulse(item(0.2));
    const nextWeek = pulse(item(7));
    expect(overdue).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(nextWeek);
    expect(pulseLevel(overdue)).toBe("high");
    expect(pulseLevel(nextWeek)).toBe("calm");
  });

  it("lifts exams as they approach", () => {
    expect(pulse(item(2, "MEDIUM", "exam"))).toBeGreaterThan(pulse(item(2, "MEDIUM", "assignment")));
  });
});
