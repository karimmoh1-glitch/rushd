import { useState } from "react";
import { Alert, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { Panel } from "@/components/panel";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { StatusChip } from "@/components/status-chip";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { courseMeta, TermBar } from "@/components/course-tile";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useQuery } from "@/lib/use-query";

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh, reload } = useQuery(() => api.course(id), [id]);
  const [starting, setStarting] = useState<string | null>(null);

  async function start(target: { assignmentId: string } | { examId: string }, key: string) {
    setStarting(key);
    try {
      await api.startSession(target, "MANUAL");
      router.push("/session");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "conflict") router.push("/session");
      else Alert.alert("Couldn't start the session", caught instanceof ApiError ? caught.message : "Try again.");
    } finally {
      setStarting(null);
    }
  }

  const course = data?.course;
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen topInset={false} refreshing={refreshing} onRefresh={refresh} staleError={data ? error : null}>
        {loading && !data ? (
          <View style={{ gap: 12 }}>
            <SkeletonCard lines={3} tall />
            <SkeletonCard lines={3} />
          </View>
        ) : !data && error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data && course ? (
          <>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "stretch" }}>
              <View style={{ width: 4, borderRadius: 2, backgroundColor: course.color }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="display" accessibilityRole="header">
                  {course.name}
                </Text>
                {courseMeta(course) ? (
                  <Text variant="caption" tone="muted">
                    {courseMeta(course)}
                  </Text>
                ) : null}
                {course.teacher ? (
                  <Text variant="caption" tone="muted">
                    {course.teacher}
                    {course.period ? ` · ${course.period}` : ""}
                  </Text>
                ) : null}
              </View>
            </View>

            <Panel title="This week">
              <View style={{ gap: 12, paddingTop: 4 }}>
                <Text variant="body">
                  {formatDuration(course.studiedMinutesLast7Days)} studied in the last 7 days
                  {course.weeklyGoalMinutes ? ` of your ${formatDuration(course.weeklyGoalMinutes)} goal` : ""}.
                </Text>
                <TermBar term={course.term} color={course.color} />
              </View>
            </Panel>

            <Panel title="Open work" aside={<Text variant="caption" tone="muted">{course.openAssignmentCount} open</Text>}>
              {data.openAssignments.length === 0 ? (
                <EmptyState title="Nothing open in this course" />
              ) : (
                data.openAssignments.map((assignment) => (
                  <View key={assignment.id} style={{ paddingVertical: 10, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium">{assignment.title}</Text>
                        <Text variant="caption" tone="muted">
                          {formatDuration(assignment.estimatedMinutes)} · {assignment.dueLabel}
                        </Text>
                      </View>
                      <StatusChip status={assignment.dueStatus} />
                    </View>
                    <Button
                      label="Start session"
                      variant="outline"
                      busy={starting === assignment.id}
                      onPress={() => start({ assignmentId: assignment.id }, assignment.id)}
                      accessibilityHint={`Starts a study session for ${assignment.title}`}
                    />
                  </View>
                ))
              )}
            </Panel>

            {data.upcomingExams.length > 0 && (
              <Panel title="Exams">
                {data.upcomingExams.map((exam) => (
                  <View key={exam.id} style={{ paddingVertical: 10, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium">{exam.title}</Text>
                        <Text variant="caption" tone="muted">
                          {exam.dueLabel} · {formatDuration(exam.prepMinutes)} prep
                        </Text>
                      </View>
                      <StatusChip status={exam.dueStatus} />
                    </View>
                    <Button
                      label="Start prep session"
                      variant="outline"
                      busy={starting === exam.id}
                      onPress={() => start({ examId: exam.id }, exam.id)}
                    />
                  </View>
                ))}
              </Panel>
            )}
          </>
        ) : null}
      </Screen>
    </>
  );
}
