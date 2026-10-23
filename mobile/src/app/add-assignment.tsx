import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { Field } from "@/components/field";
import { Button } from "@/components/button";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState, ErrorState, OfflineBanner } from "@/components/states";
import { api, ApiError } from "@/lib/api";
import type { Priority } from "@/lib/api/types";
import { radius, useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/use-query";

// Add an assignment with taps, not a date-picker wheel: pick a day in the
// next two weeks and a time. Times are the phone's local time.

const TIMES = [
  { label: "8:00 AM", hour: 8, minute: 0 },
  { label: "12:00 PM", hour: 12, minute: 0 },
  { label: "5:00 PM", hour: 17, minute: 0 },
  { label: "11:59 PM", hour: 23, minute: 59 },
];
const ESTIMATES = [15, 30, 45, 60, 90, 120, 180];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

function nextDays(count: number) {
  const days: { key: string; label: string; sub: string; date: Date }[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "short" });
    const sub = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    days.push({ key: date.toDateString(), label, sub, date });
  }
  return days;
}

function Chip({ label, sub, selected, onPress, color }: { label: string; sub?: string; selected: boolean; onPress: () => void; color?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={{
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.signal : colors.borderStrong,
        backgroundColor: selected ? colors.signalSoft : colors.card,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
      }}
    >
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <View style={{ alignItems: "center" }}>
        <Text variant="label" style={{ color: selected ? colors.foreground : colors.mutedForeground }}>
          {label}
        </Text>
        {sub ? (
          <Text variant="mono" tone="muted" style={{ fontSize: 10 }}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

export default function AddAssignmentScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const courses = useQuery(() => api.courses());
  const active = useMemo(() => courses.data?.filter((course) => !course.archived) ?? [], [courses.data]);
  const days = useMemo(() => nextDays(14), []);

  const [courseId, setCourseId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dayKey, setDayKey] = useState(days[1].key);
  const [time, setTime] = useState(TIMES[3]);
  const [estimate, setEstimate] = useState(30);
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCourse = courseId ?? active[0]?.id ?? null;

  async function save() {
    if (!selectedCourse) return;
    if (!title.trim()) {
      setError("Enter a title.");
      return;
    }
    const day = days.find((d) => d.key === dayKey) ?? days[1];
    const due = new Date(day.date);
    due.setHours(time.hour, time.minute, 0, 0);
    setBusy(true);
    setError(null);
    try {
      await api.createAssignment({
        courseId: selectedCourse,
        title: title.trim(),
        dueAt: due.toISOString(),
        estimatedMinutes: estimate,
        priority,
        notes: notes.trim() || undefined,
      });
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      {courses.loading && !courses.data ? (
        <SkeletonCard lines={4} />
      ) : !courses.data && courses.error ? (
        <ErrorState error={courses.error} onRetry={courses.reload} />
      ) : active.length === 0 ? (
        <EmptyState title="Add a course first">Assignments belong to a course. Add your courses on the web, then come back.</EmptyState>
      ) : (
        <>
          {error ? <OfflineBanner message={error} /> : null}
          <Group label="Course">
            {active.map((course) => (
              <Chip key={course.id} label={course.name} color={course.color} selected={selectedCourse === course.id} onPress={() => setCourseId(course.id)} />
            ))}
          </Group>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="Problem set 4" maxLength={160} returnKeyType="done" />
          <View style={{ gap: 8 }}>
            <Text variant="label">Due</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Due day">
              {days.map((day) => (
                <Chip key={day.key} label={day.label} sub={day.sub} selected={dayKey === day.key} onPress={() => setDayKey(day.key)} />
              ))}
            </ScrollView>
            <View accessibilityRole="radiogroup" accessibilityLabel="Due time" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TIMES.map((option) => (
                <Chip key={option.label} label={option.label} selected={time.label === option.label} onPress={() => setTime(option)} />
              ))}
            </View>
          </View>
          <Group label="Estimate">
            {ESTIMATES.map((minutes) => (
              <Chip key={minutes} label={minutes < 60 ? `${minutes}m` : `${minutes / 60}h`} selected={estimate === minutes} onPress={() => setEstimate(minutes)} />
            ))}
          </Group>
          <Group label="Priority">
            {PRIORITIES.map((option) => (
              <Chip key={option.value} label={option.label} selected={priority === option.value} onPress={() => setPriority(option.value)} />
            ))}
          </Group>
          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} style={{ minHeight: 88, paddingTop: 12, textAlignVertical: "top" }} />
          <Button label="Add assignment" variant="signal" size="lg" busy={busy} onPress={save} />
        </>
      )}
    </ScrollView>
  );
}
