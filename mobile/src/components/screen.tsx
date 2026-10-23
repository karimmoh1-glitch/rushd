import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { OfflineBanner } from "@/components/states";
import { useTheme } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";
import type { ApiError } from "@/lib/api";

// A scrolling screen with a large title, pull-to-refresh, safe-area padding,
// and an offline banner when the device has no connection or a refresh failed
// over data that's already showing.

export function Screen({
  title,
  eyebrow,
  right,
  refreshing,
  onRefresh,
  staleError,
  children,
  topInset = true,
}: {
  title?: string;
  eyebrow?: string;
  right?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  staleError?: ApiError | null;
  children: ReactNode;
  topInset?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  let banner: string | null = null;
  if (!online) banner = "You're offline. What you see may be out of date.";
  else if (staleError) banner = staleError.code === "offline" || staleError.code === "timeout" ? "Couldn't reach Rushd. Pull down to try again." : staleError.message;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: (topInset ? insets.top : 0) + 12,
        paddingBottom: insets.bottom + 32,
        paddingLeft: Math.max(insets.left, 16),
        paddingRight: Math.max(insets.right, 16),
        gap: 16,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.signal} colors={[colors.signal]} />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {(title || right) && (
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            {eyebrow ? (
              <Text variant="caption" tone="muted">
                {eyebrow}
              </Text>
            ) : null}
            {title ? (
              <Text variant="display" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      )}
      {banner ? <OfflineBanner message={banner} /> : null}
      {children}
    </ScrollView>
  );
}
