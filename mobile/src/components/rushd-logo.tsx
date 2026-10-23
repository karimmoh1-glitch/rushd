import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "@/components/text";
import { fonts, useTheme } from "@/lib/theme";

// The Rushd mark from the web (src/components/brand/rushd-mark.tsx): the three
// dots of the shīn (ش) in رُشد settled onto a rising path that ends in a lit
// saffron node. Same paths, drawn with react-native-svg.

const DOTS = [
  { cx: 5, cy: 24.5 },
  { cx: 11, cy: 20 },
  { cx: 17, cy: 16.5 },
];

export function RushdMark({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessible={false}>
      <Path
        d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5"
        fill="none"
        stroke={colors.foreground}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      {DOTS.map((dot) => (
        <Circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={2.3} fill={colors.foreground} />
      ))}
      <Circle cx={25.5} cy={8.5} r={3.8} fill={colors.signal} />
    </Svg>
  );
}

/** Mark, "Rushd" in Newsreader, a hairline, and رُشد in Amiri. */
export function RushdLogo({ scale = 1 }: { scale?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Rushd"
      style={{ flexDirection: "row", alignItems: "center", gap: 8 * scale }}
    >
      <RushdMark size={28 * scale} />
      <Text style={{ fontFamily: fonts.display, fontSize: 22 * scale, lineHeight: 26 * scale }} maxFontSizeMultiplier={1.3}>
        Rushd
      </Text>
      <View style={{ width: 1, height: 20 * scale, backgroundColor: colors.borderStrong, marginHorizontal: 2 }} />
      <Text
        style={{ fontFamily: fonts.arabic, fontSize: 22 * scale, lineHeight: 30 * scale, writingDirection: "rtl" }}
        maxFontSizeMultiplier={1.3}
      >
        رُشد
      </Text>
    </View>
  );
}
