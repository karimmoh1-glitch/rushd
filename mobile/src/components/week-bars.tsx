import { View } from "react-native";
import { Text } from "@/components/text";
import type { Today } from "@/lib/api/types";
import { formatDuration } from "@/lib/format";
import { radius, useTheme } from "@/lib/theme";

// Planned study per day for the coming week over the time available that
// day; the same drawing as the web's WorkloadBars.

function shortDuration(minutes: number): string {
  if (minutes <= 0) return "–";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

function percent(minutes: number, max: number): `${number}%` {
  if (minutes <= 0) return "0%";
  return `${Math.max(6, Math.round((minutes / max) * 100))}%`;
}

export function WeekBars({ days }: { days: Today["week"]["days"] }) {
  const { colors } = useTheme();
  const max = Math.max(60, ...days.map((day) => Math.max(day.minutes, day.availableMinutes)));
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel="Planned study for the next 7 days">
      {days.map((day, index) => {
        const isToday = index === 0;
        const overloaded = day.availableMinutes > 0 && day.minutes > day.availableMinutes;
        const fill = overloaded ? colors.overdue : isToday ? colors.signal : colors.foreground + "8c";
        return (
          <View
            key={day.date}
            style={{ flex: 1, alignItems: "center", gap: 6 }}
            accessible
            accessibilityLabel={`${day.label}: ${formatDuration(day.minutes)} planned of ${formatDuration(day.availableMinutes)} available${
              overloaded ? ", more than you have time for" : ""
            }`}
          >
            <View style={{ height: 88, width: "100%", maxWidth: 34, justifyContent: "flex-end", borderRadius: radius.sm, backgroundColor: colors.muted + "80", overflow: "hidden" }}>
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: percent(day.availableMinutes, max), backgroundColor: colors.muted }} />
              <View style={{ height: percent(day.minutes, max), borderRadius: radius.sm, backgroundColor: fill }} />
            </View>
            <Text variant="label" tone={isToday ? "signal" : "muted"} style={isToday ? { fontWeight: "600" } : undefined}>
              {day.letter}
            </Text>
            <Text variant="mono" tone="muted" style={{ fontSize: 10 }}>
              {shortDuration(day.minutes)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
