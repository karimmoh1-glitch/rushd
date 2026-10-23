import { useEffect } from "react";
import { View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader/400Regular_Italic";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Amiri_700Bold } from "@expo-google-fonts/amiri/700Bold";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { fonts, useTheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { state } = useAuth();
  const { scheme, colors } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.card, text: colors.foreground, border: colors.border, primary: colors.signalInk },
  };

  useEffect(() => {
    if (state !== "loading") void SplashScreen.hideAsync().catch(() => {});
  }, [state]);

  if (state === "loading") return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerTitleStyle: { fontFamily: fonts.uiSemibold },
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={state === "signedIn"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="course/[id]" options={{ headerShown: true, title: "", headerBackTitle: "Courses" }} />
          <Stack.Screen name="session" options={{ presentation: "modal", gestureEnabled: false }} />
          <Stack.Screen name="add-assignment" options={{ presentation: "modal", headerShown: true, title: "Add assignment" }} />
        </Stack.Protected>
        <Stack.Protected guard={state === "signedOut"}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, failed] = useFonts({
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Amiri_700Bold,
  });
  // Without fonts the app still works in system fonts; don't block on a failure.
  if (!loaded && !failed) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Navigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
