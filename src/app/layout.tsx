import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader, Amiri } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

// Arabic for the رُشد logotype (bold only).
const amiri = Amiri({ variable: "--font-amiri", subsets: ["arabic"], weight: ["700"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// viewport-fit=cover lets phone layouts use the safe-area insets (notch, home bar).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#161514" },
    { media: "(prefers-color-scheme: light)", color: "#f8f6f1" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Rushd: your personal AI study agent",
    template: "%s · Rushd",
  },
  applicationName: "Rushd",
  openGraph: {
    type: "website",
    siteName: "Rushd",
    title: "Rushd: your personal AI study agent",
    description:
      "Rushd learns your classes, quizzes you, finds exactly what you don't understand, recommends what to watch and practice, and tells you what to study next.",
    // No url here: pages inherit openGraph, and a fixed "/" made every
    // shared page (pricing, tools, ...) claim to be the homepage.
  },
  twitter: { card: "summary_large_image" },
  description:
    "Rushd is a personal AI learning system: it connects to your courses, tutors you from your own materials, checks your work, tracks what you've mastered, and plans what to study next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${amiri.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
