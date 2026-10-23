import type { Metadata } from "next";
import Link from "next/link";
import { aiEnabled } from "@/lib/env";
import {
  BookOpen,
  ChevronRight,
  Compass,
  GraduationCap,
  LineChart,
  ListChecks,
  MessageSquareText,
  PenLine,
  Plug,
  Settings,
  Target,
  Upload,
  UserRound,
} from "lucide-react";

export const metadata: Metadata = { title: "More" };

type MoreLink = { href: string; label: string; detail: string; icon: typeof BookOpen; ai?: true };

// Everything that doesn't fit in the phone tab bar, grouped by what it's for.
// AI-only links are hidden when AI features are off on this server.
const GROUPS: { title: string; links: MoreLink[] }[] = [
  {
    title: "Your work",
    links: [
      { href: "/courses", label: "Courses", detail: "Modules, materials, rubrics", icon: BookOpen },
      { href: "/assignments", label: "Assignments", detail: "Everything due, with feedback", icon: ListChecks },
      { href: "/exams", label: "Exams", detail: "Upcoming tests", icon: GraduationCap },
      { href: "/import", label: "Import from a screenshot", detail: "Add work from a photo of a calendar", icon: Upload, ai: true },
    ],
  },
  {
    title: "Learning",
    links: [
      { href: "/mastery", label: "Mastery", detail: "What you know and what to review", icon: Target },
      { href: "/tutor", label: "Tutor", detail: "Work through a problem, step by step", icon: MessageSquareText, ai: true },
      { href: "/practice", label: "Practice checks", detail: "Check worked answers from a photo", icon: PenLine, ai: true },
      { href: "/mastery/habits", label: "Progress", detail: "What your study sessions show", icon: LineChart },
      { href: "/profile", label: "Academic profile", detail: "Your courses, time, and habits", icon: UserRound },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/settings", label: "Settings", detail: "Profile, plan, tutor, Canvas", icon: Settings },
      { href: "/settings#integrations", label: "Integrations", detail: "Canvas, Teams, calendar feed", icon: Plug },
      { href: "/how-rushd-thinks", label: "How Rushd plans", detail: "The reasoning behind your plan", icon: Compass },
    ],
  },
];

export default function MorePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">More</h1>
      {GROUPS.map((group) => {
        const links = group.links.filter((link) => aiEnabled || !link.ai);
        const headingId = `more-${group.title.toLowerCase().replace(/\s+/g, "-")}`;
        return (
          <section key={group.title} aria-labelledby={headingId} className="space-y-2">
            <h2 id={headingId} className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {group.title}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                      <link.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{link.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{link.detail}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
