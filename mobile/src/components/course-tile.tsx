import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import type { Course, TermProgress } from "@/lib/api/types";
import { formatDuration } from "@/lib/format";
import { radius, tint, useTheme } from "@/lib/theme";

export function courseMeta(course: Course): string {
  return [course.levelLabel, course.code, course.institution].filter(Boolean).join(" · ");
}

export function termText(term: TermProgress | null): string | null {
  if (!term) return null;
  if (term.state === "upcoming") return "Term hasn't started";
  if (term.state === "ended") return "Term ended";
  return `Week ${term.week} of ${term.weeks}`;
}

export function TermBar({ term, color }: { term: TermProgress | null; color: string }) {
  const { colors } = useTheme();
  if (!term) return null;
  const percent = term.state === "running" ? term.percent : term.state === "ended" ? 100 : 0;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${termText(term)}${term.state === "running" ? `, ${term.percent}% through the term` : ""}`}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View style={{ height: 4, width: `${percent}%`, backgroundColor: color, borderRadius: 2 }} />
      </View>
      <Text variant="mono" tone="muted">
        {termText(term)}
      </Text>
    </View>
  );
}

/** An identity tile: the course's color rule, name, level/code, term progress, and real counts. */
export function CourseTile({ course, onPress }: { course: Course; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const meta = courseMeta(course);
  const stats = [
    `${course.openAssignmentCount} open`,
    course.upcomingExamCount > 0 ? `${course.upcomingExamCount} exam${course.upcomingExamCount === 1 ? "" : "s"}` : null,
    course.studiedMinutesLast7Days > 0 ? `${formatDuration(course.studiedMinutesLast7Days)} this week` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${course.name}${meta ? `, ${meta}` : ""}. ${stats}`}
      accessibilityHint="Opens the course"
      style={({ pressed }) => ({
        backgroundColor: tint(course.color, colors.card, scheme === "dark" ? 0.07 : 0.05),
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        paddingLeft: 20,
        gap: 10,
        overflow: "hidden",
        opacity: course.archived ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: course.color }} />
      <View style={{ gap: 2 }}>
        <Text variant="title" numberOfLines={2}>
          {course.name}
        </Text>
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <TermBar term={course.term} color={course.color} />
      <Text variant="caption" tone="muted">
        {stats}
      </Text>
    </Pressable>
  );
}
