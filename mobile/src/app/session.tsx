import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState, ErrorState, OfflineBanner } from "@/components/states";
import { RushdMark } from "@/components/rushd-logo";
import { api, ApiError } from "@/lib/api";
import type { AbandonReason, ActiveSession, Difficulty, SessionSummary } from "@/lib/api/types";
import { elapsedMinutes, formatClock, formatDuration } from "@/lib/format";
import { fonts, radius, useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/use-query";

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "EASIER", label: "Easier" },
  { value: "AS_EXPECTED", label: "As expected" },
  { value: "HARDER", label: "Harder" },
];

const REASONS: { value: AbandonReason; label: string }[] = [
  { value: "RAN_OUT_OF_TIME", label: "Ran out of time" },
  { value: "HARDER_THAN_EXPECTED", label: "Harder than expected" },
  { value: "GOT_DISTRACTED", label: "Got distracted" },
  { value: "NEED_HELP", label: "Need help" },
  { value: "SOMETHING_CAME_UP", label: "Something came up" },
  { value: "OTHER", label: "Other" },
];

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export default function SessionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: session, error, loading, reload } = useQuery(() => api.activeSession());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [abandoned, setAbandoned] = useState(false);

  let body: React.ReactNode;
  if (summary) body = <Finished summary={summary} />;
  else if (abandoned) body = <EmptyState title="Session stopped" action={<Button label="Back to Today" variant="outline" onPress={close} />}>No problem. Rushd keeps the work on your plan.</EmptyState>;
  else if (loading && session === undefined) body = <SkeletonCard lines={4} tall />;
  else if (session === undefined && error) body = <ErrorState error={error} onRetry={reload} />;
  else if (!session)
    body = (
      <EmptyState title="No session in progress" action={<Button label="Back" variant="outline" onPress={close} />}>
        Start one from Next up on Today, or from a course.
      </EmptyState>
    );
  else body = <Running session={session} onCompleted={setSummary} onAbandoned={() => setAbandoned(true)} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 20, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <RushdMark size={22} />
          <Text variant="label" tone="muted">
            Study session
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}>
          <Text variant="bodyMedium" tone="muted">
            Close
          </Text>
        </Pressable>
      </View>
      {body}
    </ScrollView>
  );
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Running({ session, onCompleted, onAbandoned }: { session: ActiveSession; onCompleted: (summary: SessionSummary) => void; onAbandoned: () => void }) {
  const { colors } = useTheme();
  const now = useNow();
  const [mode, setMode] = useState<"timer" | "complete" | "abandon">("timer");
  const elapsedSeconds = (now - new Date(session.startedAt).getTime()) / 1000;
  const percent = Math.min(100, Math.round((elapsedSeconds / 60 / session.plannedMinutes) * 100));
  const over = elapsedSeconds / 60 > session.plannedMinutes;

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: session.classColor }} />
          <Text variant="caption" tone="muted">
            {session.className}
          </Text>
        </View>
        <Text variant="title" accessibilityRole="header">
          {session.title}
        </Text>
      </View>

      <View style={{ alignItems: "center", gap: 12, paddingVertical: 12 }} accessible accessibilityLabel={`${Math.floor(elapsedSeconds / 60)} minutes elapsed of ${session.plannedMinutes} planned`}>
        <Text
          style={{ fontFamily: fonts.display, fontSize: 76, lineHeight: 86, color: colors.foreground, fontVariant: ["tabular-nums"] }}
          maxFontSizeMultiplier={1.2}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {formatClock(elapsedSeconds)}
        </Text>
        <View style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
          <View style={{ width: `${percent}%`, height: 6, borderRadius: 3, backgroundColor: over ? colors.soon : colors.signal }} />
        </View>
        <Text variant="mono" tone="muted">
          {over ? `Past the ${formatDuration(session.plannedMinutes)} planned` : `${formatDuration(session.plannedMinutes)} planned`}
        </Text>
      </View>

      {mode === "timer" && (
        <View style={{ gap: 10 }}>
          <Button label="Finish session" variant="signal" size="lg" onPress={() => setMode("complete")} />
          <Button label="Stop without finishing" variant="ghost" onPress={() => setMode("abandon")} />
        </View>
      )}
      {mode === "complete" && <CompleteForm session={session} onCancel={() => setMode("timer")} onDone={onCompleted} />}
      {mode === "abandon" && <AbandonForm session={session} onCancel={() => setMode("timer")} onDone={onAbandoned} />}
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.signal : colors.borderStrong,
        backgroundColor: selected ? colors.signalSoft : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="label" style={{ color: selected ? colors.foreground : colors.mutedForeground }}>
        {label}
      </Text>
    </Pressable>
  );
}

function CompleteForm({ session, onCancel, onDone }: { session: ActiveSession; onCancel: () => void; onDone: (summary: SessionSummary) => void }) {
  const [minutes, setMinutes] = useState(String(Math.min(1000, elapsedMinutes(session.startedAt))));
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      setError("Enter whole minutes between 1 and 1000.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.completeSession(session.id, value, difficulty));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Field
        label="Minutes you actually studied"
        hint="The timer is only a suggestion: count focused time."
        value={minutes}
        onChangeText={(text) => setMinutes(text.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        error={error}
      />
      <View style={{ gap: 8 }}>
        <Text variant="label">How did it feel? (optional)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
          {DIFFICULTIES.map((option) => (
            <Choice
              key={option.value}
              label={option.label}
              selected={difficulty === option.value}
              onPress={() => setDifficulty(difficulty === option.value ? undefined : option.value)}
            />
          ))}
        </View>
      </View>
      <Button label="Save session" variant="signal" size="lg" busy={busy} onPress={save} />
      <Button label="Keep going" variant="ghost" onPress={onCancel} />
    </View>
  );
}

function AbandonForm({ session, onCancel, onDone }: { session: ActiveSession; onCancel: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<AbandonReason | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abandon() {
    setBusy(true);
    setError(null);
    try {
      await api.abandonSession(session.id, reason);
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't stop the session. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {error ? <OfflineBanner message={error} /> : null}
      <View style={{ gap: 8 }}>
        <Text variant="label">Why did you stop?</Text>
        <Text variant="caption" tone="muted">
          Totally optional. Skip it if you&apos;d rather not say.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }} accessibilityRole="radiogroup">
          {REASONS.map((option) => (
            <Choice key={option.value} label={option.label} selected={reason === option.value} onPress={() => setReason(reason === option.value ? undefined : option.value)} />
          ))}
        </View>
      </View>
      <Button label="Stop session" variant="destructive" busy={busy} onPress={abandon} />
      <Button label="Keep going" variant="ghost" onPress={onCancel} />
    </View>
  );
}

function Finished({ summary }: { summary: SessionSummary }) {
  const difference = summary.actualMinutes - summary.plannedMinutes;
  const comparison =
    difference === 0 ? "right on your plan" : difference > 0 ? `${formatDuration(difference)} more than planned` : `${formatDuration(-difference)} less than planned`;
  return (
    <View style={{ gap: 16, paddingTop: 8 }} accessibilityLiveRegion="polite">
      <Text variant="display" accessibilityRole="header">
        Session saved.
      </Text>
      <Text variant="body">
        {formatDuration(summary.actualMinutes)} on {summary.title}, {comparison}. Rushd uses this to make your next estimates more realistic.
      </Text>
      <Button label="Back to Today" variant="signal" size="lg" onPress={close} />
    </View>
  );
}
