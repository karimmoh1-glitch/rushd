import type { MetadataRoute } from "next";

const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tools", priority: 0.7, changeFrequency: "monthly" },
  { path: "/tools/rank-my-week", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tools/exam-study-planner", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/founder", priority: 0.8, changeFrequency: "monthly" },
  { path: "/schools", priority: 0.7, changeFrequency: "monthly" },
  { path: "/download", priority: 0.6, changeFrequency: "monthly" },
  { path: "/signup", priority: 0.6, changeFrequency: "yearly" },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://therushd.com";
  return PAGES.map((p) => ({ url: `${base}${p.path}`, lastModified: new Date("2026-10-22"), changeFrequency: p.changeFrequency, priority: p.priority }));
}
