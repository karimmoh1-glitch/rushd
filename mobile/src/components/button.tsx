import { useRef } from "react";
import { ActivityIndicator, Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/text";
import { radius, useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// Buttons are at least 44pt tall (Apple's minimum touch target). Pressing
// scales to 0.97 over 120ms; with Reduce Motion on, nothing moves.

type Variant = "signal" | "primary" | "outline" | "ghost" | "destructive";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: Variant;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "md" | "lg";
}

export function Button({ label, variant = "primary", busy = false, disabled, style, size = "md", ...props }: ButtonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const press = (to: number) => {
    if (reduced) return;
    Animated.timing(scale, { toValue: to, duration: 120, useNativeDriver: true }).start();
  };

  const palette = {
    signal: { bg: colors.signal, fg: colors.signalForeground, border: colors.signal },
    primary: { bg: colors.foreground, fg: colors.background, border: colors.foreground },
    outline: { bg: "transparent", fg: colors.foreground, border: colors.borderStrong },
    ghost: { bg: "transparent", fg: colors.foreground, border: "transparent" },
    destructive: { bg: "transparent", fg: colors.destructive, border: colors.borderStrong },
  }[variant];
  const inactive = disabled || busy;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!inactive, busy }}
        disabled={inactive}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        style={({ pressed }) => ({
          minHeight: size === "lg" ? 52 : 44,
          paddingHorizontal: 18,
          borderRadius: radius.md,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: inactive ? 0.55 : pressed ? 0.88 : 1,
        })}
        {...props}
      >
        {busy && <ActivityIndicator size="small" color={palette.fg} />}
        <Text variant="bodyMedium" style={{ color: palette.fg, fontSize: size === "lg" ? 16 : 15 }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
