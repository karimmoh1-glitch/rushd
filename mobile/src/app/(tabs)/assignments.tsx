import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Screen } from "@/components/screen";
import { Panel } from "@/components/panel";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { CourseRule } from "@/components/course-rule";
import { StatusChip } from "@/components/status-chip";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState, ErrorState, OfflineBanner } from "@/components/states";
import { api, ApiError } from "@/lib/api";
import type { Assignment } from "@/lib/api/types";
import { formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/use-query";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export default function AssignmentsScreen() {
  const { data, error, loading, refreshing, refresh, reload, setData, loadedAt } = useQuery(() => api.assignments("all"));
  const [actionError, setActionError] = useState<string | null>(null);
  // Rows checked off here stay in place (struck through) until fresh data arrives.
  const [doneHere, setDoneHere] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setDoneHere(new Set()), [loadedAt]);
  const recentlyDone = (row: Assignment) => row.status === "COMPLETED" && doneHere.has(row.id);

  async function toggle(assignment: Assignment) {
    const next = assignment.status === "COMPLETED" ? "NOT_STARTED" : "COMPLETED";
    setActionError(null);
    setDoneHere((current) => {
      const copy = new Set(current);
      if (next === "COMPLETED") copy.add(assignment.id);
      else copy.delete(assignment.id);
      return copy;
    });
    // Optimistic: the check lands at once; the server's answer replaces the row.
    setData((rows) => rows?.map((row) => (row.id === assignment.id ? { ...row, status: next } : row)));
    try {
      const updated = await api.setAssignmentStatus(assignment.id, next);
      setData((rows) => rows?.map((row) => (row.id === updated.id ? updated : row)));
    } catch (caught) {
      setData((rows) => rows?.map((row) => (row.id === assignment.id ? assignment : row)));
      setActionError(caught instanceof ApiError ? caught.message : "Couldn't save that. Try again.");
    }
  }

  const open = data?.filter((row) => row.status !== "COMPLETED" || recentlyDone(row)) ?? [];
  const completed = data?.filter((row) => row.status === "COMPLETED" && !recentlyDone(row)) ?? [];

  return (
    <Screen
      title="Assignments"
      right={<Button label="Add" variant="outline" onPress={() => router.push("/add-assignment")} accessibilityHint="Opens the form to add an assignment" />}
      refreshing={refreshing}
      onRefresh={refresh}
      staleError={data ? error : null}
    >
      {data && data.length > 0 ? (
        <Text variant="caption" tone="muted" style={{ marginTop: -8 }}>
          Ranked by Pulse: how strongly each one needs you right now.
        </Text>
      ) : null}
      {actionError ? <OfflineBanner message={actionError} /> : null}
      {loading && !data ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      ) : !data && error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data && data.length === 0 ? (
        <Panel>
          <EmptyState
            title="Your workload starts here"
            action={<Button label="Add an assignment" variant="signal" onPress={() => router.push("/add-assignment")} />}
          >
            Add one by hand, or connect Canvas on the web to import every assignment and due date.
          </EmptyState>
        </Panel>
      ) : data ? (
        <>
          <Panel>
            {open.length === 0 ? (
              <Text variant="caption" tone="muted" style={{ paddingVertical: 6 }}>
                Everything open is done. Nice work.
              </Text>
            ) : (
              open.map((row, index) => <AssignmentRow key={row.id} assignment={row} first={index === 0} onToggle={() => toggle(row)} />)
            )}
          </Panel>
          {completed.length > 0 && (
            <Panel title="Completed">
              {completed.map((row, index) => (
                <AssignmentRow key={row.id} assignment={row} first={index === 0} onToggle={() => toggle(row)} />
              ))}
            </Panel>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function AssignmentRow({ assignment, first, onToggle }: { assignment: Assignment; first: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const done = assignment.status === "COMPLETED";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        minHeight: 60,
      }}
    >
      <CheckButton
        done={done}
        title={assignment.title}
        onPress={onToggle}
      />
      <CourseRule color={assignment.course.color} height={34} />
      <View style={{ flex: 1, opacity: done ? 0.6 : 1 }}>
        <Text variant="bodyMedium" numberOfLines={2} style={done ? { textDecorationLine: "line-through" } : undefined}>
          {assignment.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {assignment.course.name} · {formatDuration(assignment.estimatedMinutes)}
          {assignment.source === "CANVAS" ? " · Canvas" : ""}
        </Text>
      </View>
      {!done && (
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <StatusChip status={assignment.dueStatus} />
          <Text variant="mono" tone={assignment.dueStatus === "overdue" ? "overdue" : "muted"}>
            {assignment.dueLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

/** A 44pt check target. Completing pops the check in (scale + fade, 220ms); Reduce Motion skips the motion. */
function CheckButton({ done, title, onPress }: { done: boolean; title: string; onPress: () => void }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(done ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(done ? 1 : 0);
      return;
    }
    Animated.timing(progress, { toValue: done ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [done, progress, reduced]);

  const scale = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 1.08, 1] });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
      hitSlop={4}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: done ? colors.done : colors.borderStrong,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.done,
            alignItems: "center",
            justifyContent: "center",
            opacity: progress,
            transform: [{ scale }],
          }}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" accessible={false}>
            <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={colors.background} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </View>
    </Pressable>
  );
}
