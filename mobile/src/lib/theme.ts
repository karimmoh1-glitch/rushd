import { useColorScheme } from "react-native";

// Rushd's brand tokens (src/app/globals.css in the web app), converted from
// OKLCH to hex because React Native has no OKLCH. Graphite dark is the
// default; light follows the system setting.

export const palettes = {
  dark: {
    background: "#100e0c",
    foreground: "#f2f0ea",
    card: "#191714",
    surface2: "#211d1b",
    muted: "#26221f",
    mutedForeground: "#aeaaa5",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.14)",
    signal: "#f2b95a",
    signalInk: "#f4c26a",
    signalSoft: "#382810",
    signalForeground: "#191512",
    teal: "#6dc3b8",
    destructive: "#ef7f72",
    overdue: "#ef7f72",
    soon: "#f2b95a",
    done: "#6dc3b8",
  },
  light: {
    background: "#f8f7f2",
    foreground: "#1d1a17",
    card: "#fefdfb",
    surface2: "#f2f0eb",
    muted: "#f0eee8",
    mutedForeground: "#67625f",
    border: "#e0ded8",
    borderStrong: "#cdcac3",
    signal: "#efac44",
    signalInk: "#8f520d",
    signalSoft: "#fdefd2",
    signalForeground: "#1d1a17",
    teal: "#2b7068",
    destructive: "#af3d34",
    overdue: "#af3d34",
    soon: "#8d4f0c",
    done: "#2b7068",
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)["dark"]]: string };
export type Scheme = keyof typeof palettes;

export const fonts = {
  display: "Newsreader_500Medium",
  displayItalic: "Newsreader_400Regular_Italic",
  ui: "Geist_400Regular",
  uiMedium: "Geist_500Medium",
  uiSemibold: "Geist_600SemiBold",
  arabic: "Amiri_700Bold",
} as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;

/** Dark unless the system asks for light: graphite is Rushd's default. */
export function useTheme(): { scheme: Scheme; colors: Palette } {
  const system = useColorScheme();
  const scheme: Scheme = system === "light" ? "light" : "dark";
  return { scheme, colors: palettes[scheme] };
}

export { tint } from "./theme-math";
