import { forwardRef } from "react";
import { TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { Text } from "@/components/text";
import { fonts, radius, useTheme } from "@/lib/theme";

export const Field = forwardRef<TextInputInstance, TextInputProps & { label: string; hint?: string; error?: string | null }>(
  function Field({ label, hint, error, style, ...props }, ref) {
    const { colors } = useTheme();
    return (
      <View style={{ gap: 6 }}>
        <Text variant="label">{label}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.mutedForeground}
          allowFontScaling
          style={[
            {
              minHeight: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: error ? colors.destructive : colors.borderStrong,
              backgroundColor: colors.card,
              color: colors.foreground,
              paddingHorizontal: 14,
              fontFamily: fonts.ui,
              fontSize: 16,
            },
            style,
          ]}
          {...props}
        />
        {error ? (
          <Text variant="caption" style={{ color: colors.destructive }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);
