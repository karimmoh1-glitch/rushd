import { useEffect, useRef } from "react";
import { Animated, View, type DimensionValue } from "react-native";
import { radius, useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** A placeholder block that breathes while data loads (still with Reduce Motion). */
export function Skeleton({ height = 16, width = "100%", rounded = radius.sm }: { height?: number; width?: DimensionValue; rounded?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  return <Animated.View style={{ height, width, borderRadius: rounded, backgroundColor: colors.muted, opacity }} />;
}

/** A card-shaped group of skeleton lines. */
export function SkeletonCard({ lines = 3, tall = false }: { lines?: number; tall?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      accessible
      style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}
    >
      <Skeleton height={tall ? 22 : 14} width="45%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </View>
  );
}
