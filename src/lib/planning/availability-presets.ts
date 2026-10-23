// One-tap availability presets for onboarding, so students don't have to
// fill in a weekly grid. Each preset becomes one row per day it covers.
export interface AvailabilityPreset {
  id: string;
  label: string;
  days: number[]; // 0 = Sunday .. 6 = Saturday
  startMinute: number;
  endMinute: number;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

export const AVAILABILITY_PRESETS: AvailabilityPreset[] = [
  {
    id: "weekday-afternoon",
    label: "Weekday afternoons",
    days: WEEKDAYS,
    startMinute: 15 * 60,
    endMinute: 18 * 60,
  },
  {
    id: "weekday-evening",
    label: "Weekday evenings",
    days: WEEKDAYS,
    startMinute: 19 * 60,
    endMinute: 22 * 60,
  },
  {
    id: "weekend-morning",
    label: "Weekend mornings",
    days: WEEKEND,
    startMinute: 9 * 60,
    endMinute: 12 * 60,
  },
  {
    id: "weekend-afternoon",
    label: "Weekend afternoons",
    days: WEEKEND,
    startMinute: 13 * 60,
    endMinute: 17 * 60,
  },
  {
    id: "weekend-evening",
    label: "Weekend evenings",
    days: WEEKEND,
    startMinute: 18 * 60,
    endMinute: 21 * 60,
  },
];

/** The weekly availability rows for one preset (empty if the id is unknown). */
export function presetToWindows(presetId: string) {
  const preset = AVAILABILITY_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [];
  return preset.days.map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: preset.startMinute,
    endMinute: preset.endMinute,
  }));
}

/** "3:00 PM" for a minute of the day. */
export function formatMinutes(minute: number): string {
  const hour24 = Math.floor(minute / 60);
  const minutesPastHour = minute % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) {
    hour12 = 12;
  }
  return `${hour12}:${minutesPastHour.toString().padStart(2, "0")} ${period}`;
}
