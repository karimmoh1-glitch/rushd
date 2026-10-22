import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Rushd: your personal AI learning system",
    template: "%s · Rushd",
  },
  applicationName: "Rushd",
  openGraph: {
    type: "website",
    siteName: "Rushd",
    title: "Rushd: your personal AI learning system",
    description:
      "Connect your coursework, learn with a tutor grounded in your own class materials, check your work against real rubrics, and know what to study next.",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  description:
    "Rushd is a personal AI learning system: it connects to your courses, tutors you from your own materials, checks your work, tracks what you've mastered, and plans what to study next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
