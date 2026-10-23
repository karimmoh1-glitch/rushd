import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Panel } from "@/components/panel";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { CourseRule } from "@/components/course-rule";
import { StatusChip } from "@/components/status-chip";
import { WeekBars } from "@/components/week-bars";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { api, API_URL, ApiError } from "@/lib/api";
import type { ActiveSession, Today, User } from "@/lib/api/types";
import { formatDuration } from "@/lib/format";
import { radius, tint, useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/use-query";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function summaryLine(today: Today): string {
  const parts: string[] = [];
  if (today.overdueCount > 0) parts.push(`${today.overdueCount} overdue`);
  parts.push(today.dueThisWeek === 0 ? "Nothing else due this week" : `${today.dueThisWeek} due in the next 7 days`);
  return parts.join(" · ");
}

export default function TodayScreen() {
  const query = useQuery(async () => {
    const [today, user, session] = await Promise.all([api.today(), api.me(), api.activeSession()]);
    return { today, user, session };
  });
  const { data, error, loading, refreshing, refresh, reload } = query;

  const name = data?.user.displayName?.trim();
  const title = `${greeting(new Date().getHours())}${name ? `, ${name}` : ""}.`;

  return (
    <Screen
      eyebrow={data?.today.dateLabel}
      title={data ? title : undefined}
      refreshing={refreshing}
      onRefresh={refresh}
      staleError={data ? error : null}
    >
      {loading && !data ? (
        <TodaySkeleton />
      ) : !data && error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <TodayContent today={data.today} user={data.user} session={data.session} onChanged={reload} />
      ) : null}
    </Screen>
  );
}

function TodaySkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <SkeletonCard lines={4} tall />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </View>
  );
}

function TodayContent({ today, user, session, onChanged }: { today: Today; user: User; session: ActiveSession | null; onChanged: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <Text variant="caption" tone="muted" style={{ marginTop: -8 }}>
        {summaryLine(today)}
      </Text>

      {!user.onboardingCompleted && (
        <Panel>
          <Text variant="bodyMedium">Finish setting up on the web</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            Add your courses and study times at {API_URL.replace(/^https?:\/\//, "")}, and your plan shows up here.
          </Text>
          <View style={{ marginTop: 10, alignItems: "flex-start" }}>
            <Button label="Open Rushd on the web" variant="outline" onPress={() => void Linking.openURL(`${API_URL}/onboarding`)} />
          </View>
        </Panel>
      )}

      {session ? <ActiveSessionCard session={session} /> : today.nextUp ? <NextUpCard next={today.nextUp} onChanged={onChanged} /> : null}

      <Panel title="Today" aside={today.plannedMinutesToday > 0 ? <Text variant="caption" tone="muted">{formatDuration(today.plannedMinutesToday)} planned</Text> : undefined}>
        {today.todayBlocks.length > 0 ? (
          <View>
            {today.todayBlocks.map((block, index) => (
              <View
                key={`${block.itemId}-${index}`}
                accessible
                accessibilityLabel={`${block.timeLabel ? `${block.timeLabel}, ` : ""}${block.title}, ${block.courseName}, ${formatDuration(block.minutes)}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: "transparent" }}
              >
                <Text variant="mono" tone="muted" style={{ width: 64 }}>
                  {block.timeLabel ?? "Any time"}
                </Text>
                <CourseRule color={block.courseColor} height={30} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={2}>
                    {block.title}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {block.courseName} · {formatDuration(block.minutes)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <TodayEmpty today={today} />
        )}
      </Panel>

      <Panel title="Coming up">
        {today.comingUp.length === 0 ? (
          <Text variant="caption" tone="muted" style={{ paddingVertical: 4 }}>
            No deadlines or exams ahead.
          </Text>
        ) : (
          today.comingUp.map((row) => (
            <View
              key={`${row.kind}-${row.id}`}
              accessible
              accessibilityLabel={`${row.title}, ${row.courseName}${row.kind === "exam" ? ", exam" : ""}, ${row.dueLabel}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, minHeight: 44 }}
            >
              <CourseRule color={row.courseColor} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {row.title}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {row.courseName}
                  {row.kind === "exam" ? " · Exam" : ""}
                  {row.fromCanvas ? " · Canvas" : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <StatusChip status={row.dueStatus} />
                <Text variant="mono" tone={row.dueStatus === "overdue" ? "overdue" : "muted"}>
                  {row.dueLabel}
                </Text>
              </View>
            </View>
          ))
        )}
      </Panel>

      {today.week.show && (
        <Panel title="This week" aside={<Text variant="caption" tone="muted">{formatDuration(today.week.plannedMinutes)} planned</Text>}>
          <View style={{ paddingTop: 6 }}>
            <WeekBars days={today.week.days} />
          </View>
          {today.week.shortfallMinutes > 0 && (
            <Text variant="caption" style={{ marginTop: 12 }} tone="soon">
              {formatDuration(today.week.shortfallMinutes)} of work won&apos;t fit before its deadline in your study time.
            </Text>
          )}
        </Panel>
      )}

      {today.courseStudyTime.length > 0 && (
        <Panel title="Your courses" aside={<Text variant="caption" tone="muted">Last 7 days</Text>}>
          <View style={{ gap: 12, paddingTop: 4 }}>
            {today.courseStudyTime.map((row) => {
              const percent = row.goalMinutes ? Math.min(100, Math.round((row.minutes / row.goalMinutes) * 100)) : null;
              return (
                <View key={row.id} accessible accessibilityLabel={`${row.name}: ${formatDuration(row.minutes)}${row.goalMinutes ? ` of ${formatDuration(row.goalMinutes)} goal` : " studied"}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                      <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                        {row.name}
                      </Text>
                    </View>
                    <Text variant="mono" tone="muted">
                      {formatDuration(row.minutes)}
                      {row.goalMinutes ? ` of ${formatDuration(row.goalMinutes)}` : " studied"}
                    </Text>
                  </View>
                  {percent !== null && <ProgressBar color={row.color} percent={percent} />}
                </View>
              );
            })}
          </View>
        </Panel>
      )}
    </View>
  );
}

function ProgressBar({ color, percent }: { color: string; percent: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, marginTop: 6, overflow: "hidden" }}>
      <View style={{ height: 6, width: `${percent}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function TodayEmpty({ today }: { today: Today }) {
  const empty = today.todayEmpty;
  if (!empty.hasWork) {
    return (
      <EmptyState title="Nothing to plan yet">
        Add an assignment from the Assignments tab, or connect Canvas on the web to bring in your deadlines.
      </EmptyState>
    );
  }
  if (empty.noAvailability) {
    return (
      <Text variant="caption" tone="muted" style={{ paddingVertical: 4 }}>
        Rushd doesn&apos;t know when you can study yet, so it can&apos;t place work at specific times. Set your study times in Settings on the web.
      </Text>
    );
  }
  return (
    <Text variant="caption" tone="muted" style={{ paddingVertical: 4 }}>
      {empty.availableMinutesToday === 0 ? "No study time left today." : "Nothing needs today's study time."}
      {empty.laterBlock ? ` Next block: ${empty.laterBlock.title}, ${empty.laterBlock.when}.` : ""}
    </Text>
  );
}

function NextUpCard({ next, onChanged }: { next: NonNullable<Today["nextUp"]>; onChanged: () => void }) {
  const { colors, scheme } = useTheme();
  const [busy, setBusy] = useState(false);
  const background = tint(next.courseColor, colors.card, scheme === "dark" ? 0.12 : 0.08);

  async function start() {
    setBusy(true);
    try {
      const target = next.kind === "assignment" ? { assignmentId: next.itemId } : { examId: next.itemId };
      await api.startSession(target, "PLANNED");
      router.push("/session");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "conflict") {
        router.push("/session");
      } else {
        Alert.alert("Couldn't start the session", caught instanceof ApiError ? caught.message : "Try again.");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        backgroundColor: background,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 18,
        gap: 12,
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: next.courseColor }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text variant="label" tone="signal" style={{ letterSpacing: 0.6, textTransform: "uppercase", fontSize: 11 }}>
          Next up
        </Text>
        <Text variant="mono" tone="muted" accessibilityLabel={`Pulse ${next.pulse} out of 100`}>
          Pulse {next.pulse}
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="title" accessibilityRole="header">
          {next.title}
        </Text>
        <Text variant="caption" tone="muted">
          {next.courseName}
          {next.kind === "exam" ? " · Exam prep" : ""} · {formatDuration(next.minutes)}
          {next.plannedLabel ? ` · ${next.plannedLabel}` : ""}
        </Text>
      </View>
      {next.reasons.length > 0 && (
        <View style={{ gap: 6 }} accessibilityLabel={`Why this first: ${next.reasons.join(" ")}`} accessible>
          {next.reasons.map((reason) => (
            <View key={reason} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.signal, marginTop: 8 }} />
              <Text variant="caption" style={{ flex: 1 }}>
                {reason}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Button label="Start session" variant="signal" size="lg" busy={busy} onPress={start} accessibilityHint={`Starts a study session for ${next.title}`} />
    </View>
  );
}

function ActiveSessionCard({ session }: { session: ActiveSession }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ backgroundColor: colors.signalSoft, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.signal + "55", padding: 18, gap: 10 }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal }} />
        <Text variant="label" tone="signal">
          Session in progress
        </Text>
      </View>
      <Text variant="title">{session.title}</Text>
      <Text variant="caption" tone="muted">
        {session.className} · planned {formatDuration(session.plannedMinutes)}
      </Text>
      <Button label="Open session" variant="signal" onPress={() => router.push("/session")} />
    </View>
  );
}
