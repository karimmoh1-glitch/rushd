import Svg, { Circle, Path, Rect } from "react-native-svg";

// Line icons for the tab bar, drawn in the mark's stroke weight.

type IconProps = { color: string; size?: number; focused?: boolean; accent: string };

export function TodayIcon({ color, size = 24, focused, accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M4 18.5C7.5 16 9.5 13.5 13 12S17.5 7.5 19 5.5" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={4} cy={18.5} r={1.7} fill={color} />
      <Circle cx={19} cy={5.5} r={2.8} fill={focused ? accent : color} />
    </Svg>
  );
}

export function AssignmentsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M4.5 7l1.6 1.6L9 5.7M4.5 13.5l1.6 1.6L9 12.2" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12.5 7.2h7M12.5 13.7h7M5 19.5h14.5" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function CoursesIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Rect x={4} y={4} width={7} height={7} rx={1.6} fill="none" stroke={color} strokeWidth={1.7} />
      <Rect x={13} y={4} width={7} height={7} rx={1.6} fill="none" stroke={color} strokeWidth={1.7} />
      <Rect x={4} y={13} width={7} height={7} rx={1.6} fill="none" stroke={color} strokeWidth={1.7} />
      <Rect x={13} y={13} width={7} height={7} rx={1.6} fill="none" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

export function SettingsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={15} cy={7} r={2} fill="none" stroke={color} strokeWidth={1.7} />
      <Circle cx={9} cy={17} r={2} fill="none" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}
