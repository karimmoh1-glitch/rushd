import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { ApiError } from "@/lib/api";
import { radius, useTheme } from "@/lib/theme";

// Empty, error, and offline states, drawn from the web's PathEmpty / BrokenPath.

const POINTS = [
  [14, 30], [38, 12], [60, 40], [84, 18], [104, 46], [128, 22], [150, 38], [26, 52], [118, 6],
];

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 20, gap: 6 }}>
      <Svg width={120} height={42} viewBox="0 0 170 60" accessible={false}>
        {POINTS.map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={2.2} fill={colors.foreground} opacity={0.18 + (i % 3) * 0.08} />
        ))}
        <Circle cx={160} cy={14} r={4.5} fill={colors.signal} />
      </Svg>
      <Text variant="bodyMedium" style={{ marginTop: 8 }}>
        {title}
      </Text>
      {children ? (
        <Text variant="caption" tone="muted">
          {children}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 10, alignItems: "flex-start" }}>{action}</View> : null}
    </View>
  );
}

function BrokenPath() {
  const { colors } = useTheme();
  return (
    <Svg width={96} height={32} viewBox="0 0 120 40" accessible={false}>
      <Path d="M6 30C20 28 30 22 44 20" fill="none" stroke={colors.foreground} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M62 17C74 15 84 11 96 9" fill="none" stroke={colors.foreground} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="2 5" opacity={0.5} />
      <Circle cx={6} cy={30} r={2.4} fill={colors.foreground} />
      <Circle cx={26} cy={26} r={2.4} fill={colors.foreground} />
      <Circle cx={44} cy={20} r={2.4} fill={colors.foreground} />
      <Circle cx={108} cy={7} r={4.5} fill={colors.signal} />
    </Svg>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const offline = error.code === "offline" || error.code === "timeout";
  return (
    <View style={{ paddingVertical: 28, gap: 8 }} accessibilityLiveRegion="polite">
      <BrokenPath />
      <Text variant="bodyMedium" style={{ marginTop: 6 }}>
        {offline ? "You're offline" : "This didn't load"}
      </Text>
      <Text variant="caption" tone="muted">
        {offline ? "Rushd can't be reached right now. Check your connection, then try again." : error.message}
      </Text>
      <View style={{ marginTop: 8, alignItems: "flex-start" }}>
        <Button label="Try again" variant="outline" onPress={onRetry} />
      </View>
    </View>
  );
}

/** A slim banner over stale content while the device is offline or the last refresh failed. */
export function OfflineBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.signalSoft,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.signal + "40",
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal }} />
      <Text variant="caption" style={{ flex: 1, color: colors.foreground }}>
        {message}
      </Text>
    </View>
  );
}
