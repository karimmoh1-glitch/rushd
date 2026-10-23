import { View } from "react-native";

/** The thin vertical color rule that marks a course, as on the web. */
export function CourseRule({ color, height = 32 }: { color: string; height?: number }) {
  return <View accessible={false} style={{ width: 4, height, borderRadius: 2, backgroundColor: color }} />;
}
