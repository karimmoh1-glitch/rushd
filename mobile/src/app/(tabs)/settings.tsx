import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import Constants from "expo-constants";
import { Screen } from "@/components/screen";
import { Panel } from "@/components/panel";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { RushdLogo } from "@/components/rushd-logo";
import { SkeletonCard } from "@/components/skeleton";
import { ErrorState, OfflineBanner } from "@/components/states";
import { api, API_URL, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { useQuery } from "@/lib/use-query";

function confirm(title: string, message: string, action: string): Promise<boolean> {
  // react-native-web has no Alert dialogs; the web preview uses the browser's.
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 8 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="body" style={{ flexShrink: 1, textAlign: "right" }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { signOut, signOutEverywhere } = useAuth();
  const { data: user, error, loading, refreshing, refresh, reload } = useQuery(() => api.me());
  const [busy, setBusy] = useState<"one" | "all" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onSignOut() {
    setBusy("one");
    await signOut();
  }

  async function onSignOutEverywhere() {
    const ok = await confirm("Sign out everywhere?", "This signs you out of Rushd on every phone, computer and browser, including this one.", "Sign out everywhere");
    if (!ok) return;
    setBusy("all");
    setActionError(null);
    try {
      await signOutEverywhere();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Couldn't reach Rushd. Try again when you're online.");
      setBusy(null);
    }
  }

  const version = Constants.expoConfig?.version ?? "dev";
  return (
    <Screen title="Settings" refreshing={refreshing} onRefresh={refresh} staleError={user ? error : null}>
      {actionError ? <OfflineBanner message={actionError} /> : null}
      <Panel title="Account">
        {loading && !user ? (
          <SkeletonCard lines={2} />
        ) : !user && error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : user ? (
          <View>
            <Row label="Name" value={user.displayName ?? "Not set"} />
            <Row label="Email" value={user.email} />
            <Row label="Time zone" value={user.timeZone ?? "Not set"} />
          </View>
        ) : null}
        <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>
          Study times, courses, Canvas, and account deletion are on the web for now.
        </Text>
        <View style={{ marginTop: 12, alignItems: "flex-start" }}>
          <Button label="Open settings on the web" variant="outline" onPress={() => void Linking.openURL(`${API_URL}/settings`)} />
        </View>
      </Panel>

      <Panel title="Sign out">
        <View style={{ gap: 10, paddingTop: 4 }}>
          <Button label="Sign out" variant="outline" busy={busy === "one"} disabled={busy !== null} onPress={onSignOut} />
          <Button label="Sign out everywhere" variant="destructive" busy={busy === "all"} disabled={busy !== null} onPress={onSignOutEverywhere} />
          <Text variant="caption" tone="muted">
            Sign out everywhere ends every Rushd session: other phones, computers, and browsers too. Use it if you lost a device.
          </Text>
        </View>
      </Panel>

      <View style={{ alignItems: "center", gap: 6, paddingTop: 8 }}>
        <RushdLogo scale={0.85} />
        <Text variant="mono" tone="muted">
          Version {version} · {API_URL.replace(/^https?:\/\//, "")}
        </Text>
      </View>
    </Screen>
  );
}
