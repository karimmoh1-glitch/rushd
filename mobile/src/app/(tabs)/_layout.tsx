import { Tabs } from "expo-router/tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AssignmentsIcon, CoursesIcon, SettingsIcon, TodayIcon } from "@/components/tab-icons";
import { fonts, useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Room for the icon and a full line of label text above the home indicator.
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64 + insets.bottom, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 6) },
        tabBarLabelStyle: { fontFamily: fonts.uiMedium, fontSize: 11, lineHeight: 14 },
        tabBarAllowFontScaling: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: ({ color, focused }) => <TodayIcon color={String(color)} focused={focused} accent={colors.signal} /> }}
      />
      <Tabs.Screen
        name="assignments"
        options={{ title: "Assignments", tabBarIcon: ({ color }) => <AssignmentsIcon color={String(color)} accent={colors.signal} /> }}
      />
      <Tabs.Screen
        name="courses"
        options={{ title: "Courses", tabBarIcon: ({ color }) => <CoursesIcon color={String(color)} accent={colors.signal} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <SettingsIcon color={String(color)} accent={colors.signal} /> }}
      />
    </Tabs>
  );
}
