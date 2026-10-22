import { generatePlan } from "@/lib/planning/schedule";
import { scoreAndRank } from "@/lib/planning/score";
import { presetToWindows } from "@/lib/planning/availability-presets";
import { zonedTimeToUtc, addDaysToKey } from "@/lib/time/zone";
import type { AvailabilityWindow, PlanResult, WorkItem } from "@/lib/planning/types";

// A sample student's week, fed through the REAL planning engine for the
// landing page. Fixed reference time and zone, so the server render and the
// browser (where the interactive demo re-runs the engine) produce identical
// output. Labeled as a sample wherever it appears.

export const SAMPLE_TZ = "America/New_York";
export const SAMPLE_START = "2026-01-12"; // a Monday
/** Monday 3:30 PM, right after school. */
export const SAMPLE_NOW = zonedTimeToUtc(SAMPLE_START, 15 * 60 + 30, SAMPLE_TZ);

export const SAMPLE_CLASSES = {
  chem: { name: "AP Chemistry", color: "#2563eb" },
  apush: { name: "AP US History", color: "#c2410c" },
  precalc: { name: "Precalculus", color: "#7c3aed" },
  english: { name: "English 11", color: "#0d9488" },
  spanish: { name: "Spanish III", color: "#be123c" },
} as const;

type ClassKey = keyof typeof SAMPLE_CLASSES;

interface SampleItem {
  id: string;
  kind: "assignment" | "exam";
  cls: ClassKey;
  title: string;
  dueDay: number; // days after SAMPLE_START
  dueMinute: number;
  minutes: number;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  canvas?: boolean;
}

const ITEMS: SampleItem[] = [
  { id: "s1", kind: "assignment", cls: "english", title: "Gatsby ch. 6-7 annotations", dueDay: 1, dueMinute: 23 * 60 + 59, minutes: 45, canvas: true },
  { id: "s2", kind: "assignment", cls: "precalc", title: "Problem set 5.3", dueDay: 1, dueMinute: 23 * 60 + 59, minutes: 40, canvas: true },
  { id: "s3", kind: "assignment", cls: "chem", title: "Titration lab report", dueDay: 2, dueMinute: 23 * 60 + 59, minutes: 90, priority: "HIGH", canvas: true },
  { id: "s4", kind: "exam", cls: "spanish", title: "Vocab quiz, unidad 4", dueDay: 3, dueMinute: 9 * 60, minutes: 30 },
  { id: "s5", kind: "assignment", cls: "apush", title: "DBQ essay draft", dueDay: 3, dueMinute: 23 * 60 + 59, minutes: 120, canvas: true },
  { id: "s6", kind: "exam", cls: "precalc", title: "Unit 5 test", dueDay: 4, dueMinute: 8 * 60, minutes: 150 },
  { id: "s7", kind: "assignment", cls: "chem", title: "Unit 6 reading notes", dueDay: 5, dueMinute: 23 * 60 + 59, minutes: 30, canvas: true },
  { id: "s8", kind: "assignment", cls: "english", title: "Research proposal", dueDay: 7, dueMinute: 23 * 60 + 59, minutes: 120, priority: "LOW", canvas: true },
];

export const SURPRISE_ITEM: SampleItem = {
  id: "s9",
  kind: "assignment",
  cls: "chem",
  title: "Lab redo (just posted)",
  dueDay: 1,
  dueMinute: 23 * 60 + 59,
  minutes: 120,
  priority: "HIGH",
  canvas: true,
};

function toWorkItem(i: SampleItem): WorkItem {
  const cls = SAMPLE_CLASSES[i.cls];
  return {
    kind: i.kind,
    id: i.id,
    classId: i.cls,
    title: i.title,
    className: cls.name,
    classColor: cls.color,
    priority: i.priority ?? "MEDIUM",
    classPriority: "MEDIUM",
    dueAt: zonedTimeToUtc(addDaysToKey(SAMPLE_START, i.dueDay), i.dueMinute, SAMPLE_TZ),
    remainingMinutes: i.minutes,
    rawEstimatedMinutes: i.minutes,
    estimateAdjusted: false,
    source: i.canvas ? "CANVAS" : "MANUAL",
  };
}

export const SAMPLE_PRESETS = [
  { id: "weekday-afternoon", label: "Weekday afternoons", detail: "3-6 PM" },
  { id: "weekday-evening", label: "Weekday evenings", detail: "7-10 PM" },
  { id: "weekend-morning", label: "Weekend mornings", detail: "9 AM-12 PM" },
  { id: "weekend-afternoon", label: "Weekend afternoons", detail: "1-5 PM" },
] as const;

export interface SampleOptions {
  presetIds: string[];
  sessionMinutes: number;
  surprise: boolean;
}

export const DEFAULT_SAMPLE_OPTIONS: SampleOptions = {
  presetIds: ["weekday-evening", "weekend-afternoon"],
  sessionMinutes: 60,
  surprise: false,
};

export function sampleAvailability(presetIds: string[]): AvailabilityWindow[] {
  return presetIds.flatMap(presetToWindows);
}

export function sampleWorkItems(surprise: boolean): WorkItem[] {
  return [...ITEMS, ...(surprise ? [SURPRISE_ITEM] : [])].map(toWorkItem);
}

export function runSamplePlan(options: SampleOptions = DEFAULT_SAMPLE_OPTIONS): PlanResult {
  return generatePlan({
    workItems: sampleWorkItems(options.surprise),
    availability: sampleAvailability(options.presetIds),
    now: SAMPLE_NOW,
    timeZone: SAMPLE_TZ,
    horizonDays: 7,
    preferences: { preferredSessionMinutes: options.sessionMinutes, maxDailyMinutes: 180, breakMinutes: 10 },
  });
}

export function sampleRanking() {
  return scoreAndRank(sampleWorkItems(false), SAMPLE_NOW, SAMPLE_TZ);
}
