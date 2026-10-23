import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/text";
import { radius, useTheme } from "@/lib/theme";

/** A titled card, like the web's Panel on Today. */
export function Panel({
  title,
  aside,
  children,
  style,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 14,
          shadowColor: "#000",
          shadowOpacity: scheme === "dark" ? 0.3 : 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
        style,
      ]}
    >
      {(title || aside) && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6, minHeight: 24 }}>
          {title ? (
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View />
          )}
          {aside}
        </View>
      )}
      {children}
    </View>
  );
}
