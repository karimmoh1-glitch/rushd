import { Linking, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Panel } from "@/components/panel";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { CourseTile } from "@/components/course-tile";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { api, API_URL } from "@/lib/api";
import { useQuery } from "@/lib/use-query";

export default function CoursesScreen() {
  const { data, error, loading, refreshing, refresh, reload } = useQuery(() => api.courses());
  const active = data?.filter((course) => !course.archived) ?? [];
  const archived = data?.filter((course) => course.archived) ?? [];
  const open = (id: string) => router.push({ pathname: "/course/[id]", params: { id } });

  return (
    <Screen title="Courses" refreshing={refreshing} onRefresh={refresh} staleError={data ? error : null}>
      {loading && !data ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard lines={2} tall />
          <SkeletonCard lines={2} tall />
        </View>
      ) : !data && error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data && data.length === 0 ? (
        <Panel>
          <EmptyState
            title="No courses yet"
            action={<Button label="Add courses on the web" variant="outline" onPress={() => void Linking.openURL(`${API_URL}/courses`)} />}
          >
            Add your courses on the web, or connect Canvas there to import them. They show up here right after.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {active.map((course) => (
            <CourseTile key={course.id} course={course} onPress={() => open(course.id)} />
          ))}
          {archived.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text variant="label" tone="muted" accessibilityRole="header">
                Archived
              </Text>
              {archived.map((course) => (
                <CourseTile key={course.id} course={course} onPress={() => open(course.id)} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
