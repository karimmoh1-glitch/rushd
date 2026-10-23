import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fonts, useTheme } from "@/lib/theme";

// Text with Rushd's type scale. Font scaling (Dynamic Type) stays on; very
// large display text is capped so a heading can't push a screen sideways.

type Variant = "display" | "title" | "heading" | "body" | "bodyMedium" | "label" | "caption" | "mono";

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.uiSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: fonts.uiMedium, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.uiMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fonts.uiMedium, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: "default" | "muted" | "signal" | "overdue" | "soon" | "done";
}

export function Text({ variant = "body", tone = "default", style, maxFontSizeMultiplier, ...props }: AppTextProps) {
  const { colors } = useTheme();
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    signal: colors.signalInk,
    overdue: colors.overdue,
    soon: colors.soon,
    done: colors.done,
  }[tone];
  const cap = variant === "display" || variant === "title" ? 1.6 : 2.2;
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? cap}
      style={[VARIANTS[variant], { color }, style]}
      {...props}
    />
  );
}
